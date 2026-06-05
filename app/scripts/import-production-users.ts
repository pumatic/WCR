import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Faltan SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const inputPath = path.join(process.cwd(), "scripts/data/production-users.csv");
const outputPath = path.join(
  process.cwd(),
  `scripts/output/created-users-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`
);

type ImportUser = {
  display_name: string;
  email: string;
  country: string;
};

function generatePassword() {
  return `Puma2026!${crypto.randomBytes(5).toString("base64url")}`;
}

function parseCsv(content: string): ImportUser[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = lines.slice(1);

  return rows.map((line) => {
    const [display_name, email, country] = line.split(",").map((v) => v.trim());

    if (!display_name || !email || !country) {
      throw new Error(`Fila inválida en CSV: ${line}`);
    }

    return {
      display_name,
      email: email.toLowerCase(),
      country: country.toUpperCase(),
    };
  });
}

async function main() {
  const csv = fs.readFileSync(inputPath, "utf8");
  const users = parseCsv(csv);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const createdCredentials: string[] = [
    "display_name,email,password,status",
  ];

  const stats = {
    totalCsv: users.length,
    created: 0,
    alreadyExists: 0,
    authErrors: 0,
    usersErrors: 0,
    profilesErrors: 0,
  };

  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    const displayName = user.display_name.trim();
    const password = generatePassword();

    console.log(`Procesando: ${email}`);

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id,email")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      console.log(`SKIP: ${email} ya existe en profiles`);
      createdCredentials.push(`${displayName},${email},,already_exists`);
      stats.alreadyExists++;
      continue;
    }

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
        },
      });

    if (authError || !authData.user) {
      console.error(`ERROR Auth ${email}:`, authError?.message);
      createdCredentials.push(`${displayName},${email},,auth_error`);
      stats.authErrors++;
      continue;
    }

    const authUser = authData.user;

    const { error: usersError } = await supabase.from("users").upsert(
      {
        id: authUser.id,
        email,
        display_name: displayName,
        is_admin: false,
      },
      { onConflict: "id" }
    );

    if (usersError) {
      console.error(`ERROR users ${email}:`, usersError.message);
      createdCredentials.push(`${displayName},${email},${password},users_error`);
      stats.usersErrors++;
      continue;
    }

    const { error: profilesError } = await supabase.from("profiles").upsert(
      {
        id: authUser.id,
        email,
        display_name: displayName,
        country: user.country,
        role: "user",
        must_change_password: true,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (profilesError) {
      console.error(`ERROR profiles ${email}:`, profilesError.message);
      createdCredentials.push(
        `${displayName},${email},${password},profiles_error`
      );
      stats.profilesErrors++;
      continue;
    }

    createdCredentials.push(`${displayName},${email},${password},created`);
    stats.created++;
    console.log(`OK: ${email}`);
  }

  fs.writeFileSync(outputPath, createdCredentials.join("\n"), "utf8");

  console.log("");
  console.log("Importación completada");
console.log("----------------------");
console.log(`Usuarios en CSV:        ${stats.totalCsv}`);
console.log(`Usuarios creados:       ${stats.created}`);
console.log(`Ya existentes:          ${stats.alreadyExists}`);
console.log(`Errores Auth:           ${stats.authErrors}`);
console.log(`Errores public.users:   ${stats.usersErrors}`);
console.log(`Errores profiles:       ${stats.profilesErrors}`);
console.log("----------------------");
console.log(`Credenciales generadas en: ${outputPath}`);
}

main().catch((err) => {
  console.error("Error general:", err);
  process.exit(1);
});