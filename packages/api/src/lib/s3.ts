import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME ?? 'lake-pass-uploads';

export type UploadCategory =
  | 'boat-photos'
  | 'licenses'
  | 'insurance';

export const ALLOWED_MIME: Record<
  UploadCategory,
  string[]
> = {
  'boat-photos': [
    'image/jpeg',
    'image/png',
    'image/webp',
  ],

  licenses: [
    'image/jpeg',
    'image/png',
    'application/pdf',
  ],

  insurance: [
    'image/jpeg',
    'image/png',
    'application/pdf',
  ],
};

export const MAX_SIZE: Record<
  UploadCategory,
  number
> = {
  'boat-photos': 10 * 1024 * 1024,
  licenses: 5 * 1024 * 1024,
  insurance: 5 * 1024 * 1024,
};

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export async function getUploadUrl(
  category: UploadCategory,
  mimeType: string
) {
  const allowed = ALLOWED_MIME[category];

  if (!allowed.includes(mimeType)) {
    throw new Error(
      `Invalid file type: ${mimeType}`
    );
  }

  const extension =
    EXTENSIONS[mimeType] ?? 'bin';

  const key =
    `${category}/${crypto.randomUUID()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: mimeType,

    // Enforce SSE-S3
    ServerSideEncryption: 'AES256',
  });

  const uploadUrl = await getSignedUrl(
    s3,
    command,
    {
      expiresIn: 300,
    }
  );

  const region =
    process.env.AWS_REGION ?? 'us-east-1';

  const publicUrl =
    `https://${BUCKET}.s3.${region}.amazonaws.com/${key}`;

  return {
    uploadUrl,
    publicUrl,
    key,
    maxSizeBytes: MAX_SIZE[category],
    requiredHeaders: {
      'Content-Type': mimeType,
      'x-amz-server-side-encryption': 'AES256',
    },
  };
}

export default s3;
