import { NextResponse } from "next/server";
import { Prisma } from "@/src/Core/Clients";
import { RequireSuperAdmin } from "@/src/Web/Auth";
import { HashPassword } from "@/src/Web/Password";

async function Get(Request: Request): Promise<Response> {
  try {
    await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const Users = await Prisma.dashboardUser.findMany({
    orderBy: { CreatedAt: "desc" },
    select: {
      Id: true,
      DiscordId: true,
      Username: true,
      DisplayName: true,
      Role: true,
      IsDashboardBanned: true,
      CreatedAt: true
    }
  });

  return NextResponse.json({ Users });
}

async function Patch(Request: Request): Promise<Response> {
  let ActorId = "";

  try {
    ActorId = await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const Body = (await Request.json()) as {
    DiscordId?: string;
    Username?: string;
    DisplayName?: string;
    Role?: "SuperAdmin" | "User";
    IsDashboardBanned?: boolean;
    Password?: string;
  };

  if (!Body.DiscordId && !Body.Username) {
    return new Response("DiscordId or Username is required.", { status: 400 });
  }

  const ExistingUser = Body.DiscordId
    ? await Prisma.dashboardUser.findUnique({ where: { DiscordId: Body.DiscordId } })
    : await Prisma.dashboardUser.findUnique({ where: { Username: Body.Username as string } });

  if (!ExistingUser) {
    return new Response("User not found.", { status: 404 });
  }

  if (ExistingUser.DiscordId === ActorId && Body.IsDashboardBanned === true) {
    return new Response("You cannot ban your own account.", { status: 400 });
  }

  if (ExistingUser.DiscordId === ActorId && Body.Role === "User") {
    return new Response("You cannot remove your own SuperAdmin role.", { status: 400 });
  }

  if (Body.Password && Body.Password.length < 8) {
    return new Response("Password must contain at least 8 characters.", { status: 400 });
  }

  const Password = Body.Password && Body.Password.length >= 8 ? HashPassword(Body.Password) : null;

  const User = await Prisma.dashboardUser.update({
    where: { Id: ExistingUser.Id },
    data: {
      DisplayName: Body.DisplayName ?? ExistingUser.DisplayName,
      Role: Body.Role ?? ExistingUser.Role,
      IsDashboardBanned: Body.IsDashboardBanned ?? ExistingUser.IsDashboardBanned,
      ...(Password
        ? {
            PasswordHash: Password.PasswordHash,
            PasswordSalt: Password.PasswordSalt
          }
        : {})
    }
  });

  if (Password) {
    await Prisma.sessionToken.updateMany({
      where: { UserId: User.Id, RevokedAt: null },
      data: { RevokedAt: new Date() }
    });
  }

  await Prisma.auditLog.create({
    data: {
      ActorId,
      Action: "DashboardUserUpdated",
      Target: User.DiscordId,
      Metadata: { Role: User.Role, IsDashboardBanned: User.IsDashboardBanned, PasswordChanged: Boolean(Password) }
    }
  });

  return NextResponse.json({ User });
}

async function Post(Request: Request): Promise<Response> {
  let ActorId = "";

  try {
    ActorId = await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const Body = (await Request.json()) as {
    Username?: string;
    Password?: string;
    DiscordId?: string;
    DisplayName?: string;
    Role?: "SuperAdmin" | "User";
    IsDashboardBanned?: boolean;
  };

  if (!Body.Username || !Body.Password || Body.Password.length < 8) {
    return new Response("Username and password with at least 8 characters are required.", { status: 400 });
  }

  const Password = HashPassword(Body.Password);
  const User = await Prisma.dashboardUser.create({
    data: {
      Username: Body.Username.trim(),
      DiscordId: Body.DiscordId?.trim() || Body.Username.trim(),
      DisplayName: Body.DisplayName?.trim() || Body.Username.trim(),
      PasswordHash: Password.PasswordHash,
      PasswordSalt: Password.PasswordSalt,
      Role: Body.Role ?? "User",
      IsDashboardBanned: Body.IsDashboardBanned ?? false
    }
  });

  await Prisma.auditLog.create({
    data: {
      ActorId,
      Action: "DashboardUserCreated",
      Target: User.DiscordId,
      Metadata: { Username: User.Username, Role: User.Role }
    }
  });

  return NextResponse.json({ User }, { status: 201 });
}

async function Delete(Request: Request): Promise<Response> {
  let ActorId = "";

  try {
    ActorId = await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  const Body = (await Request.json()) as {
    DiscordId?: string;
  };

  if (!Body.DiscordId) {
    return new Response("DiscordId is required.", { status: 400 });
  }

  const ExistingUser = await Prisma.dashboardUser.findUnique({
    where: { DiscordId: Body.DiscordId }
  });

  if (!ExistingUser) {
    return new Response("User not found.", { status: 404 });
  }

  if (ExistingUser.DiscordId === ActorId) {
    return new Response("You cannot delete your own account.", { status: 400 });
  }

  await Prisma.$transaction([
    Prisma.guildRoleGrant.deleteMany({
      where: { DiscordId: ExistingUser.DiscordId }
    }),
    Prisma.dashboardUser.delete({
      where: { Id: ExistingUser.Id }
    }),
    Prisma.auditLog.create({
      data: {
        ActorId,
        Action: "DashboardUserDeleted",
        Target: ExistingUser.DiscordId,
        Metadata: { Username: ExistingUser.Username }
      }
    })
  ]);

  return NextResponse.json({ Deleted: true });
}

export { Delete as DELETE, Get as GET, Patch as PATCH, Post as POST };
