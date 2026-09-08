-- ProtectVehicleHistoryFKs: Change onDelete from Cascade to Restrict
-- for historical entities that form part of the vehicle's history.
-- These entities must NOT be cascade-deleted to preserve vehicle history integrity.

-- VehicleMileage: vehicle FK
ALTER TABLE "vehicle_mileages" DROP CONSTRAINT "vehicle_mileages_vehicle_id_fkey";
ALTER TABLE "vehicle_mileages" ADD CONSTRAINT "vehicle_mileages_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- VehicleOwnership: vehicle and user FKs
ALTER TABLE "vehicle_ownerships" DROP CONSTRAINT "vehicle_ownerships_vehicle_id_fkey";
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_ownerships" DROP CONSTRAINT "vehicle_ownerships_user_id_fkey";
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- VehicleTransfer: vehicle, fromUser, and toUser FKs
ALTER TABLE "vehicle_transfers" DROP CONSTRAINT "vehicle_transfers_vehicle_id_fkey";
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_transfers" DROP CONSTRAINT "vehicle_transfers_from_user_id_fkey";
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_from_user_id_fkey"
    FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_transfers" DROP CONSTRAINT "vehicle_transfers_to_user_id_fkey";
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_to_user_id_fkey"
    FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- WorkOrder: vehicle, workshop, branch, and customer FKs
ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_vehicle_id_fkey";
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_workshop_id_fkey";
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_workshop_id_fkey"
    FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_branch_id_fkey";
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "workshop_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_customer_id_fkey";
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ServiceRecord: vehicle and workshop FKs
ALTER TABLE "service_records" DROP CONSTRAINT "service_records_vehicle_id_fkey";
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_records" DROP CONSTRAINT "service_records_workshop_id_fkey";
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_workshop_id_fkey"
    FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Estimate: vehicle, workshop, branch, and customer FKs
ALTER TABLE "estimates" DROP CONSTRAINT "estimates_vehicle_id_fkey";
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "estimates" DROP CONSTRAINT "estimates_workshop_id_fkey";
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_workshop_id_fkey"
    FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "estimates" DROP CONSTRAINT "estimates_branch_id_fkey";
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "workshop_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "estimates" DROP CONSTRAINT "estimates_customer_id_fkey";
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;