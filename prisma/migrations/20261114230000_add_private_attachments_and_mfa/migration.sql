-- Optional TOTP second factor and private attachment storage.
ALTER TABLE "User"
    ADD COLUMN "mfaSecret" TEXT,
    ADD COLUMN "mfaEnabledAt" TIMESTAMP(3),
    ADD COLUMN "mfaRecoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Attachment"
    ADD COLUMN "fileName" TEXT;

CREATE TABLE "AttachmentBlob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttachmentBlob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttachmentBlob_userId_createdAt_idx" ON "AttachmentBlob"("userId", "createdAt");
CREATE INDEX "AttachmentBlob_createdAt_idx" ON "AttachmentBlob"("createdAt");

ALTER TABLE "AttachmentBlob"
    ADD CONSTRAINT "AttachmentBlob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
