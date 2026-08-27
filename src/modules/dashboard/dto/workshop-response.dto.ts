export class WorkshopDashboardResponseDto {
  todaySummary!: {
    vehiclesIn: number;
    vehiclesOut: number;
    openOrders: number;
    awaitingParts: number;
    delayedOrders: number;
    pendingEstimates: number;
  };

  agenda!: Array<{
    id: string;
    time: string;
    vehicle: string;
    plate: string;
    reason: string;
    status: string;
  }>;

  ordersByStatus!: Record<string, number>;

  alerts!: Array<{
    type: string;
    message: string;
    count: number;
    severity: 'warning' | 'info' | 'error';
  }>;

  recentActivity!: Array<{
    time: string;
    action: string;
    vehicle: string;
    user: string;
  }>;

  constructor(data: WorkshopDashboardResponseDto) {
    Object.assign(this, data);
  }
}
