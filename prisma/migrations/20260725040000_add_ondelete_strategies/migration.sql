-- AlterTable: Add unique constraint on admin_token
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_admin_token_key" UNIQUE ("admin_token");

-- ImpersonationSession: DropForeignKey + AddForeignKey (RESTRICT -> CASCADE)
ALTER TABLE "impersonation_sessions" DROP CONSTRAINT "impersonation_sessions_admin_id_fkey",
    ADD CONSTRAINT "impersonation_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "impersonation_sessions" DROP CONSTRAINT "impersonation_sessions_target_user_id_fkey",
    ADD CONSTRAINT "impersonation_sessions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WorkshopMember: Add onDelete strategies
ALTER TABLE "workshop_members" DROP CONSTRAINT "workshop_members_workshop_id_fkey",
    ADD CONSTRAINT "workshop_members_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workshop_members" DROP CONSTRAINT "workshop_members_user_id_fkey",
    ADD CONSTRAINT "workshop_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workshop_members" DROP CONSTRAINT "workshop_members_role_id_fkey",
    ADD CONSTRAINT "workshop_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "workshop_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workshop_members" DROP CONSTRAINT "workshop_members_default_branch_id_fkey",
    ADD CONSTRAINT "workshop_members_default_branch_id_fkey" FOREIGN KEY ("default_branch_id") REFERENCES "workshop_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkshopInvitation: Add onDelete strategies
ALTER TABLE "workshop_invitations" DROP CONSTRAINT "workshop_invitations_workshop_id_fkey",
    ADD CONSTRAINT "workshop_invitations_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workshop_invitations" DROP CONSTRAINT "workshop_invitations_role_id_fkey",
    ADD CONSTRAINT "workshop_invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "workshop_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workshop_invitations" DROP CONSTRAINT "workshop_invitations_invited_by_fkey",
    ADD CONSTRAINT "workshop_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Subscription: Add onDelete strategies
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_workshop_id_fkey",
    ADD CONSTRAINT "subscriptions_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_plan_id_fkey",
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- VehicleModel: Add onDelete Cascade on brand
ALTER TABLE "vehicle_models" DROP CONSTRAINT "vehicle_models_brand_id_fkey",
    ADD CONSTRAINT "vehicle_models_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "vehicle_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- VehicleVersion: Add onDelete Cascade on model
ALTER TABLE "vehicle_versions" DROP CONSTRAINT "vehicle_versions_model_id_fkey",
    ADD CONSTRAINT "vehicle_versions_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "vehicle_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vehicle: Add onDelete SetNull on version
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_version_id_fkey",
    ADD CONSTRAINT "vehicles_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "vehicle_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- VehicleMileage: Add onDelete SetNull on nullable user/member FKs
ALTER TABLE "vehicle_mileages" DROP CONSTRAINT "vehicle_mileages_recorded_by_user_id_fkey",
    ADD CONSTRAINT "vehicle_mileages_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vehicle_mileages" DROP CONSTRAINT "vehicle_mileages_recorded_by_member_id_fkey",
    ADD CONSTRAINT "vehicle_mileages_recorded_by_member_id_fkey" FOREIGN KEY ("recorded_by_member_id") REFERENCES "workshop_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- VehicleOwnership: Add onDelete strategies
ALTER TABLE "vehicle_ownerships" DROP CONSTRAINT "vehicle_ownerships_user_id_fkey",
    ADD CONSTRAINT "vehicle_ownerships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_ownerships" DROP CONSTRAINT "vehicle_ownerships_acquired_by_transfer_id_fkey",
    ADD CONSTRAINT "vehicle_ownerships_acquired_by_transfer_id_fkey" FOREIGN KEY ("acquired_by_transfer_id") REFERENCES "vehicle_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- VehicleTransfer: Add onDelete Cascade on all required FKs
ALTER TABLE "vehicle_transfers" DROP CONSTRAINT "vehicle_transfers_vehicle_id_fkey",
    ADD CONSTRAINT "vehicle_transfers_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_transfers" DROP CONSTRAINT "vehicle_transfers_from_user_id_fkey",
    ADD CONSTRAINT "vehicle_transfers_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_transfers" DROP CONSTRAINT "vehicle_transfers_to_user_id_fkey",
    ADD CONSTRAINT "vehicle_transfers_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- VehicleAccess: Add onDelete Cascade on user FKs
ALTER TABLE "vehicle_accesses" DROP CONSTRAINT "vehicle_accesses_user_id_fkey",
    ADD CONSTRAINT "vehicle_accesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_accesses" DROP CONSTRAINT "vehicle_accesses_granted_by_user_id_fkey",
    ADD CONSTRAINT "vehicle_accesses_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- VehicleShare: Add onDelete Cascade on createdBy
ALTER TABLE "vehicle_shares" DROP CONSTRAINT "vehicle_shares_created_by_user_id_fkey",
    ADD CONSTRAINT "vehicle_shares_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- VehicleTransferEvent: Add onDelete SetNull on nullable performedBy
ALTER TABLE "vehicle_transfer_events" DROP CONSTRAINT "vehicle_transfer_events_performed_by_user_id_fkey",
    ADD CONSTRAINT "vehicle_transfer_events_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Appointment: Add onDelete strategies
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_vehicle_id_fkey",
    ADD CONSTRAINT "appointments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointments" DROP CONSTRAINT "appointments_workshop_id_fkey",
    ADD CONSTRAINT "appointments_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointments" DROP CONSTRAINT "appointments_branch_id_fkey",
    ADD CONSTRAINT "appointments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "workshop_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointments" DROP CONSTRAINT "appointments_customer_id_fkey",
    ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointments" DROP CONSTRAINT "appointments_assigned_to_member_id_fkey",
    ADD CONSTRAINT "appointments_assigned_to_member_id_fkey" FOREIGN KEY ("assigned_to_member_id") REFERENCES "workshop_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkOrder: Add onDelete strategies
ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_vehicle_id_fkey",
    ADD CONSTRAINT "work_orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_workshop_id_fkey",
    ADD CONSTRAINT "work_orders_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_branch_id_fkey",
    ADD CONSTRAINT "work_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "workshop_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_appointment_id_fkey",
    ADD CONSTRAINT "work_orders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_customer_id_fkey",
    ADD CONSTRAINT "work_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_assigned_to_member_id_fkey",
    ADD CONSTRAINT "work_orders_assigned_to_member_id_fkey" FOREIGN KEY ("assigned_to_member_id") REFERENCES "workshop_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ServiceRecord: Add onDelete strategies
ALTER TABLE "service_records" DROP CONSTRAINT "service_records_vehicle_id_fkey",
    ADD CONSTRAINT "service_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_records" DROP CONSTRAINT "service_records_work_order_id_fkey",
    ADD CONSTRAINT "service_records_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_records" DROP CONSTRAINT "service_records_workshop_id_fkey",
    ADD CONSTRAINT "service_records_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_records" DROP CONSTRAINT "service_records_performed_by_member_id_fkey",
    ADD CONSTRAINT "service_records_performed_by_member_id_fkey" FOREIGN KEY ("performed_by_member_id") REFERENCES "workshop_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Estimate: Add onDelete strategies
ALTER TABLE "estimates" DROP CONSTRAINT "estimates_vehicle_id_fkey",
    ADD CONSTRAINT "estimates_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "estimates" DROP CONSTRAINT "estimates_workshop_id_fkey",
    ADD CONSTRAINT "estimates_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "estimates" DROP CONSTRAINT "estimates_branch_id_fkey",
    ADD CONSTRAINT "estimates_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "workshop_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "estimates" DROP CONSTRAINT "estimates_work_order_id_fkey",
    ADD CONSTRAINT "estimates_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "estimates" DROP CONSTRAINT "estimates_customer_id_fkey",
    ADD CONSTRAINT "estimates_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
