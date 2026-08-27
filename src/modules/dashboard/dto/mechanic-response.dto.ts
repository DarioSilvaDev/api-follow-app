export class MechanicDashboardResponseDto {
  assignedWork!: Array<{
    workOrderId: string;
    orderNumber: string;
    vehicle: string;
    plate: string;
    task: string;
    priority: string;
    status: string;
    estimatedCompletion: string | null;
  }>;

  pendingWork!: {
    awaitingParts: number;
    awaitingApproval: number;
    pendingDiagnosis: number;
  };

  recentVehicles!: Array<{
    vehicleId: string;
    name: string;
    plate: string;
    lastWorkDate: string;
  }>;

  constructor(data: MechanicDashboardResponseDto) {
    Object.assign(this, data);
  }
}
