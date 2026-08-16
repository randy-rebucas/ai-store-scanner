import { loader } from "../app/routes/api.cron.weekly-digest";

async function main() {
  const secret = process.env.CRON_SECRET || "local-dry-run-secret";
  process.env.CRON_SECRET = secret;

  const request = new Request("http://localhost/api/cron/weekly-digest", {
    headers: { authorization: `Bearer ${secret}` },
  });

  const response = await loader({
    request,
    params: {},
    context: {},
  } as never);

  const body = await (response as Response).json();
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
