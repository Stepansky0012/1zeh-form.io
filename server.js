import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// CORS, чтобы index.html с другого домена мог дергать /upload
app.use(cors());

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT, // из твоих env на Railway
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET || 'images';

function makeDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function makeId() {
  return crypto.randomBytes(3).toString('hex'); // 6 символов
}

function getExt(file) {
  if (!file || !file.originalname) return 'bin';
  const parts = file.originalname.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : 'bin';
}

app.post(
  '/upload',
  upload.fields([
    { name: 'facadePhoto', maxCount: 1 },
    { name: 'signFile', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const tgUserId = req.body.tgUserId || 'anon';
      const dateStr = makeDateStr();
      const idPart = makeId();
      const projectId = `${tgUserId}_${dateStr}_${idPart}`;

      let facadeKey = null;
      let signKey = null;

      const facadeFile = req.files?.facadePhoto?.[0];
      const signFile = req.files?.signFile?.[0];

      if (facadeFile) {
        const ext = getExt(facadeFile);
        facadeKey = `FACADE_${dateStr}_${idPart}.${ext}`;

        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: facadeKey,
            Body: facadeFile.buffer,
            ContentType: facadeFile.mimetype,
          }),
        );
      }

      if (signFile) {
        const ext = getExt(signFile);
        signKey = `SIGN_${dateStr}_${idPart}.${ext}`;

        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: signKey,
            Body: signFile.buffer,
            ContentType: signFile.mimetype,
          }),
        );
      }

      return res.json({
        projectId,
        facadeKey,
        signKey,
      });
    } catch (err) {
      console.error('S3 upload error:', err);
      return res.status(500).json({ error: 'upload_failed' });
    }
  },
);

const PORT = process.env.PORT || 9001;
app.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
