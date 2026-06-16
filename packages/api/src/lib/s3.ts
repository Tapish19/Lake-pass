/**
 * S3 pre-signed URL helper.
 * Install:  pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner  (packages/api)
 *
 * The API never handles the file bytes itself — it just issues a short-lived
 * pre-signed PUT URL.  The client (dashboard or mobile app) uploads directly
 * to S3 using that URL, then POSTs the resulting public URL back to the API.
 * This keeps the API stateless and avoids large payloads.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const s3 = new S3Client({
  region:      process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME ?? 'lake-pass-uploads';

export type UploadCategory = 'boat-photos' | 'licenses' | 'insurance';

/**
 * Returns a pre-signed PUT URL valid for 5 minutes.
 * The caller should PUT the file to this URL with the matching Content-Type,
 * then store the `publicUrl` returned here.
 */
export async function getUploadUrl(category: UploadCategory, mimeType: string) {
  const ext     = mimeType.split('/')[1] ?? 'bin';
  const key     = `${category}/${crypto.randomUUID()}.${ext}`;
  const command = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  const publicUrl = `https://${BUCKET}.s3.${process.env.AWS_REGION ?? 'us-east-1'}.amazonaws.com/${key}`;

  return { uploadUrl, publicUrl, key };
}
