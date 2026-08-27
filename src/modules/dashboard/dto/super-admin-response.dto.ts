export class SuperAdminDashboardResponseDto {
  overview!: {
    totalUsers: number;
    totalWorkshops: number;
    activeWorkshops: number;
    newClientsThisMonth: number;
    totalVehicles: number;
    totalWorkOrders: number;
  };

  constructor(data: SuperAdminDashboardResponseDto) {
    Object.assign(this, data);
  }

  static from(stats: {
    totalUsers: number;
    totalWorkshops: number;
    activeWorkshops: number;
    newClientsThisMonth: number;
    totalVehicles: number;
    totalWorkOrders: number;
  }): SuperAdminDashboardResponseDto {
    return new SuperAdminDashboardResponseDto({
      overview: stats,
    } as SuperAdminDashboardResponseDto);
  }
}
