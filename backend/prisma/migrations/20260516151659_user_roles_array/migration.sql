-- User.role (tek değer) → User.roles UserRole[] (array)
ALTER TABLE "User" ADD COLUMN "roles" "UserRole"[] NOT NULL DEFAULT ARRAY['OPERATOR']::"UserRole"[];
UPDATE "User" SET "roles" = ARRAY["role"]::"UserRole"[];
ALTER TABLE "User" DROP COLUMN "role";
