-- Entry.vehicleSessionId artık nullable (iade entry'leri için)
ALTER TABLE "Entry" DROP CONSTRAINT IF EXISTS "Entry_vehicleSessionId_fkey";
ALTER TABLE "Entry" ALTER COLUMN "vehicleSessionId" DROP NOT NULL;
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_vehicleSessionId_fkey" FOREIGN KEY ("vehicleSessionId") REFERENCES "VehicleSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
