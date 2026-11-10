export type FuelType =
  'gasoline' | 'diesel' | 'flex' | 'electric' | 'hybrid' | 'lpg' | 'cng';
export type Transmission = 'manual' | 'automatic' | 'cvt';
export type BodyType =
  | 'sedan'
  | 'hatchback'
  | 'suv'
  | 'pickup'
  | 'van'
  | 'coupe'
  | 'motorcycle'
  | 'truck';

export type ModelSeed = {
  brandSlug: string;
  name: string;
};

export type VehicleVersionSeed = {
  brandSlug: string;
  modelName: string;
  name: string;
  fuelType: FuelType;
  transmission: Transmission;
  bodyType: BodyType;
  doors: number | null;
  engineDisplacement: number | null;
  horsepower: number | null;
  productionFrom: number | null;
  productionTo: number | null;
};
