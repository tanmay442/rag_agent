// Dynamic favicon. Renders the RAG Support brand mark on a
// dark graphite background at 32x32. Generated at build time by
// Next.js and served as /icon (and /favicon.ico for legacy
// browsers via the metadata.icons.icon field in layout.tsx).
import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1d2e',
          borderRadius: 6,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="#3ddbd9"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 4h16v12H7l-3 4V4z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
