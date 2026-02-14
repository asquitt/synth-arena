import chalk from "chalk";
import { loadTemplate, listDomainDirs, validateTemplate } from "@syntharena/scenarios";

interface DomainsOptions {
  domainsDir?: string;
  validate: boolean;
}

export async function domainsCommand(opts: DomainsOptions): Promise<void> {
  console.log(chalk.bold("\n  SynthArena - Available Domains\n"));

  const domains = listDomainDirs(opts.domainsDir);

  if (domains.length === 0) {
    console.log(chalk.yellow("  No domains found. Create a domains/<name>/template.json file.\n"));
    return;
  }

  for (const domain of domains) {
    try {
      const loaded = loadTemplate(domain, opts.domainsDir);
      const t = loaded.template;

      console.log(`  ${chalk.cyan(chalk.bold(t.name))} ${chalk.dim(`v${t.version}`)}`);
      console.log(`  ${chalk.dim(t.description)}`);
      console.log(`  Generators:  ${t.scenarioGenerators.map((g) => g.name).join(", ")}`);
      console.log(`  Constraints: ${t.constraints.map((c) => c.name).join(", ")}`);
      console.log(`  Scorers:     ${t.defaultScorers.join(", ")}`);

      if (opts.validate) {
        const errors = validateTemplate(t);
        if (errors.length === 0) {
          console.log(`  Status:      ${chalk.green("valid")}`);
        } else {
          console.log(`  Status:      ${chalk.red(`${errors.length} errors`)}`);
          for (const err of errors) {
            console.log(`               ${chalk.red(`- ${err}`)}`);
          }
        }
      }

      console.log();
    } catch (err) {
      console.log(`  ${chalk.red(domain)} - ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}
