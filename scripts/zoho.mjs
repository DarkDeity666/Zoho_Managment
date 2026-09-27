import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { env } from "./env.mjs";
const config = env();
const schema = JSON.parse(readFileSync("packages/schema/schema.json", "utf8"));
const command = process.argv[2];
const accounts = config.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";
const domain = config.ZOHO_API_URL || "https://www.zohoapis.in";
function requireConfig(...keys) {
  for (const key of keys)
    if (!config[key]) throw new Error(`Set ${key} in the root .env first.`);
}
function safeURL(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !/^(accounts\.zoho\.(com|in|eu|com\.au|com\.cn|jp)|accounts\.zohocloud\.ca|www\.zohoapis\.(com|in|eu|com\.au|com\.cn|jp|ca))$/.test(
      url.hostname,
    )
  )
    throw new Error("Use an official Zoho accounts/API data-center URL.");
}
async function token(grant = false) {
  safeURL(accounts);
  requireConfig(
    "ZOHO_CLIENT_ID",
    "ZOHO_CLIENT_SECRET",
    grant ? "ZOHO_GRANT_CODE" : "ZOHO_REFRESH_TOKEN",
  );
  const body = new URLSearchParams({
    client_id: config.ZOHO_CLIENT_ID,
    client_secret: config.ZOHO_CLIENT_SECRET,
    grant_type: grant ? "authorization_code" : "refresh_token",
    [grant ? "code" : "refresh_token"]:
      config[grant ? "ZOHO_GRANT_CODE" : "ZOHO_REFRESH_TOKEN"],
  });
  const res = await fetch(`${accounts}/oauth/v2/token`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token)
    throw new Error(
      `Zoho OAuth failed (${json.error || res.status}). Check region, scopes, and grant expiry.`,
    );
  return json;
}
let accessToken;
async function request(method, path, body) {
  safeURL(domain);
  if (!accessToken) accessToken = (await token()).access_token;
  const res = await fetch(`${domain}/crm/v8/${path}`, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
  if (res.status === 204) return {};
  const json = await res.json();
  if (!res.ok)
    throw new Error(
      `${method} ${path}: ${json.code || res.status}. Check the Zoho module, edition, permissions and API scopes.`,
    );
  for (const key of ["modules", "fields"])
    for (const row of json[key] || [])
      if (row.status === "error")
        throw new Error(
          `${path}: ${row.code} (${row.message}). No subsequent writes were made.`,
        );
  return json;
}
function fieldPayload(field) {
  // CRM generates API names from labels. Use canonical labels and verify the
  // resulting API names after creation; never silently map a mismatched field.
  const payload = {
    field_label: field.key.replaceAll("_", " "),
    data_type:
      {
        number: "double",
        money: "currency",
        picklist: "picklist",
        lookup: "lookup",
        textarea: "textarea",
        email: "email",
        date: "date",
        phone: "phone",
      }[field.type] || "text",
  };
  if (field.unique) payload.unique = { case_sensitive: false };
  if (payload.data_type === "text") payload.length = 255;
  if (payload.data_type === "textarea") payload.length = 2000;
  if (["double", "currency"].includes(payload.data_type)) {
    payload.length = 16;
    payload.decimal_place = 2;
  }
  if (field.type === "picklist")
    payload.pick_list_values = field.options.map((display_value) => ({
      display_value,
      actual_value: display_value,
    }));
  if (field.type === "lookup")
    payload.lookup = {
      module: { api_name: field.ref },
      display_label:
        `${field.key} ${schema.find((m) => m.fields.includes(field))?.key || "Records"}`
          .replaceAll("_", " ")
          .slice(0, 50),
    };
  return payload;
}
async function main() {
  if (command === "token") {
    const result = await token(true);
    if (!result.refresh_token)
      throw new Error(
        "No refresh token returned. Generate a new grant with the correct account and scopes.",
      );
    let text = readFileSync(".env", "utf8");
    const replace = (key, value) => {
      const pattern = new RegExp(`^${key}=.*$`, "m");
      text = pattern.test(text)
        ? text.replace(pattern, `${key}=${value}`)
        : `${text}\n${key}=${value}\n`;
    };
    replace("ZOHO_REFRESH_TOKEN", result.refresh_token);
    replace("ZOHO_GRANT_CODE", "");
    if (result.api_domain) {
      safeURL(result.api_domain);
      replace("ZOHO_API_URL", result.api_domain);
    }
    writeFileSync(".env", text, { mode: 0o600 });
    console.log(
      "Refresh token saved to .env; grant code cleared. No token was printed.",
    );
    return;
  }
  if (command === "plan") {
    const plan = schema.map((m) => ({
      module: m.key,
      existing: m.key === "Leads",
      fields: m.fields
        .filter((f) => !["Name", "Last_Name", "Email", "Phone"].includes(f.key))
        .map(fieldPayload),
      requiredOnLayout: m.fields.filter((f) => f.required).map((f) => f.key),
    }));
    mkdirSync(".cache", { recursive: true });
    writeFileSync(
      ".cache/zoho-schema-plan.json",
      JSON.stringify(plan, null, 2),
    );
    console.log(
      `Schema plan: ${schema.length - 1} custom modules and the existing Leads module. See .cache/zoho-schema-plan.json. No account changes made.`,
    );
    return;
  }
  if (command !== "provision")
    throw new Error("Use token, plan, or provision.");
  requireConfig("ZOHO_PROFILE_ID");
  const existing = (await request("GET", "settings/modules")).modules || [];
  for (const mod of schema) {
    if (existing.some((m) => m.api_name === mod.key)) {
      console.log(`Module exists: ${mod.key}`);
      continue;
    }
    if (mod.key === "Leads")
      throw new Error("Leads module not available in this CRM organization.");
    await request("POST", "settings/modules", {
      modules: [
        {
          api_name: mod.key,
          singular_label: mod.singular,
          plural_label: mod.label,
          profiles: [{ id: config.ZOHO_PROFILE_ID }],
          display_field: {
            field_label: `${mod.singular} Name`,
            data_type: "text",
          },
        },
      ],
    });
    console.log(`Created module: ${mod.key}`);
  }
  for (const mod of schema) {
    let existingFields =
      (await request("GET", `settings/fields?module=${mod.key}`)).fields || [];
    for (const field of mod.fields) {
      if (existingFields.some((f) => f.api_name === field.key)) continue;
      if (field.key === "Name")
        throw new Error(
          `${mod.key} must have its primary display field API name set to Name.`,
        );
      const sameLabel = existingFields.find(
        (f) => f.field_label === field.key.replaceAll("_", " "),
      );
      if (sameLabel)
        throw new Error(
          `${mod.key}: rename API field ${sameLabel.api_name} to ${field.key} in Setup > APIs and SDKs > API Names, then rerun.`,
        );
      await request("POST", `settings/fields?module=${mod.key}`, {
        fields: [fieldPayload(field)],
      });
      existingFields =
        (await request("GET", `settings/fields?module=${mod.key}`)).fields ||
        [];
      if (!existingFields.some((f) => f.api_name === field.key))
        throw new Error(
          `${mod.key}: verify the new field API name is ${field.key}, then rerun. No duplicate field will be created.`,
        );
      console.log(`Created field: ${mod.key}.${field.key}`);
    }
  }
  console.log(
    "Module and field creation finished. Next configure required layout fields, permissions, validation rules, Deluge functions, CRM reports and the Creator portal. See docs/zoho-deployment.md.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
