/*
  Warnings:

  - Made the column `imagePublicId` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `imageUrl` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "users" ALTER COLUMN "imagePublicId" SET NOT NULL,
ALTER COLUMN "imagePublicId" SET DEFAULT '',
ALTER COLUMN "imageUrl" SET NOT NULL,
ALTER COLUMN "imageUrl" SET DEFAULT '';
