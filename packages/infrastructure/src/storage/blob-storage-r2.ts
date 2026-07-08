import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { BlobStorageAdapter } from '../adapter-ports';
import type { EnvConfig } from '@app/domain';

interface S3CompatibleConfig {
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function createS3CompatibleBlobStorage(config: S3CompatibleConfig): BlobStorageAdapter {
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async get(key) {
      const resp = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      if (!resp.Body) throw new Error('Empty response body from object storage');
      return Buffer.from(await resp.Body.transformToByteArray());
    },
    async stream(key) {
      const resp = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      if (!resp.Body) throw new Error('Empty response body from object storage');
      return resp.Body.transformToWebStream() as ReadableStream<Uint8Array>;
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
    async signedUrl(key, ttlSec) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
        expiresIn: ttlSec,
      });
    },
  };
}

export function createR2BlobStorage(
  cfg: Partial<Pick<EnvConfig.Service, 'r2AccountId' | 'r2AccessKeyId' | 'r2SecretAccessKey' | 'r2Bucket'>> = {},
): BlobStorageAdapter {
  const accountId = cfg.r2AccountId ?? process.env.R2_ACCOUNT_ID;
  const accessKeyId = cfg.r2AccessKeyId ?? process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = cfg.r2SecretAccessKey ?? process.env.R2_SECRET_ACCESS_KEY;
  const bucket = cfg.r2Bucket ?? process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET must be set.');
  }
  return createS3CompatibleBlobStorage({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    accessKeyId,
    secretAccessKey,
    bucket,
  });
}
