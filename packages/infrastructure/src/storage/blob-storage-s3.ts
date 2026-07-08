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

// Standard AWS S3 adapter. Doubles as a MinIO adapter via the
// S3_ENDPOINT env var (points the client at a self-hosted endpoint).
export function createS3BlobStorage(
  cfg: Partial<
    Pick<
      EnvConfig.Service,
      's3Region' | 's3AccessKeyId' | 's3SecretAccessKey' | 's3Bucket' | 's3Endpoint'
    >
  > = {},
): BlobStorageAdapter {
  const region = cfg.s3Region ?? process.env.S3_REGION;
  const accessKeyId = cfg.s3AccessKeyId ?? process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = cfg.s3SecretAccessKey ?? process.env.S3_SECRET_ACCESS_KEY;
  const bucket = cfg.s3Bucket ?? process.env.S3_BUCKET;
  if (!region || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET must be set.');
  }
  return createS3CompatibleBlobStorage({
    region,
    endpoint: cfg.s3Endpoint ?? process.env.S3_ENDPOINT,
    accessKeyId,
    secretAccessKey,
    bucket,
  });
}
