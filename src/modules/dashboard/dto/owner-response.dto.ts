export class OwnerDashboardResponseDto {
  vehicles!: Array<{
    id: string;
    name: string;
    plate: string;
    status: string;
    currentWorkOrder: {
      number: string;
      stage: string;
      updatedAt: string;
    } | null;
  }>;

  upcomingMaintenance!: Array<{
    vehicleId: string;
    vehicleName: string;
    action: string;
    dueDate: string;
    dueMileage: number | null;
    currentMileage: number | null;
  }>;

  constructor(data: OwnerDashboardResponseDto) {
    Object.assign(this, data);
  }
}
