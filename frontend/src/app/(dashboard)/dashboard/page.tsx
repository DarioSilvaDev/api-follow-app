"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export default function DashboardPage() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const roleNames = user.roles.map((r) => r.name).join(", ");
  const workshopNames = user.workshopMemberships
    .map((m) => m.workshop.name)
    .join(", ");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Hola, {fullName || "Usuario"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bienvenido a Historia Clínica Digital Vehicular.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Email
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{user.email}</p>
          </CardContent>
        </Card>

        {roleNames && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Rol
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{roleNames}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Propietario de vehículo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {user.isVehicleOwner ? "Sí" : "No"}
            </p>
          </CardContent>
        </Card>

        {workshopNames && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Taller
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{workshopNames}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Mis vehículos</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Registrá y consultá los vehículos de tu propiedad.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/vehicles">
            <Button variant="outline">Ver mis vehículos</Button>
          </Link>
        </CardFooter>
      </Card>

      <Card>
        <CardFooter>
          <Link href="/profile">
            <Button variant="outline">Mi perfil</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
