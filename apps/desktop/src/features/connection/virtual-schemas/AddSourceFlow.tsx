import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { errorMessage, ipc, type VsLocalState, type VsPrereqs, type VsStageResult } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import type { FieldValues, VsAdapter } from "./types.ts";
import { missingPrerequisites, type PrereqProbe } from "./prereqs.ts";
import { defaultNames, needsScriptInstall, readyToCreate, resolveDriverFile, tryBuildPlan, type PlanNames } from "./plan.ts";
import { SourceLogo } from "./SourceLogo";
import { SourcePicker } from "./steps/SourcePicker";
import { CredentialsStep, credentialsComplete } from "./steps/CredentialsStep";
import { OptionsStep, namesComplete } from "./steps/OptionsStep";
import { PrerequisitesStep } from "./steps/PrerequisitesStep";
import { CreateStep, type ProveResult } from "./steps/CreateStep";

const STEPS = ["Source", "Credentials", "Options", "Prerequisites", "Create"] as const;

/**
 * Attach another database or bucket to this Exasol as a virtual schema:
 * source → credentials → options → prerequisites → create and prove. Opens as
 * a workbench tab. Every decision (fields, DDL, what is missing) comes from
 * the catalog and the pure modules next to this file; this component only
 * sequences them.
 */
export function AddSourceFlow({
  profileId,
  connectionName,
  managedLocal,
  onCreated,
}: {
  profileId: string;
  connectionName: string;
  /** This connection is Studio's own local Exasol Personal — Studio can install prerequisites itself. */
  managedLocal: boolean;
  onCreated: (result: ProveResult & { schema: string }) => void;
}) {
  const [step, setStep] = useState(0);
  const [adapter, setAdapter] = useState<VsAdapter | null>(null);
  const [values, setValues] = useState<FieldValues>({});
  const [names, setNames] = useState<PlanNames>({ virtualSchema: "", connection: "", adapterSchema: "ADAPTER" });
  const [dbProbe, setDbProbe] = useState<VsPrereqs | null>(null);
  const [localState, setLocalState] = useState<VsLocalState | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [userJarPath, setUserJarPath] = useState("");
  const [adapterFile, setAdapterFile] = useState("");
  const [staged, setStaged] = useState<VsStageResult | null>(null);

  // Probe once per connection; refresh after an install.
  useEffect(() => {
    let dead = false;
    setProbeError(null);
    Promise.all([ipc.listVsPrereqs(profileId), managedLocal ? ipc.vsLocalState() : Promise.resolve(null)])
      .then(([db, local]) => {
        if (dead) return;
        setDbProbe(db);
        setLocalState(local);
      })
      .catch((e) => !dead && setProbeError(errorMessage(e)));
    return () => {
      dead = true;
    };
  }, [profileId, managedLocal, staged]);

  function pick(a: VsAdapter) {
    setAdapter(a);
    setValues(Object.fromEntries(a.fields.filter((f) => f.default).map((f) => [f.key, f.default!])));
    setNames(defaultNames(a));
    setStaged(null);
    setStep(1);
  }

  const probe: PrereqProbe | null = useMemo(() => {
    if (!dbProbe) return null;
    return {
      adapterScripts: dbProbe.adapters,
      udfScripts: dbProbe.udfScripts ?? [],
      bucketFiles: localState?.bucketFiles ?? [],
      connections: dbProbe.connections,
      slcAliases: localState?.managedLocal ? localState.slcAliases : undefined,
    };
  }, [dbProbe, localState]);

  // What the database itself is missing — independent of staging, because the
  // plan must know whether to create the scripts even after a stage.
  const missingInDb = useMemo(
    () => (adapter && probe ? missingPrerequisites(adapter, probe, { schema: names.adapterSchema, userDriverFile: userJarPath.split("/").pop() || undefined }) : []),
    [adapter, probe, names.adapterSchema, userJarPath],
  );
  const missing = useMemo(() => {
    if (staged) return []; // freshly staged: the plan installs the scripts
    // On a database Studio does not manage the bucket contents are unknown, so
    // only the scripts (which the plan creates) can be reported as missing.
    return managedLocal ? missingInDb : missingInDb.filter((m) => m.kind === "adapterScript" || m.kind === "importUdf");
  }, [missingInDb, staged, managedLocal]);

  const { plan, error: planError } = useMemo(() => {
    if (!adapter) return { plan: [], error: null };
    // Staged by Studio, the file names the user uploaded by hand, or what an
    // earlier run left in the bucket. A plan that cannot be built yet is a
    // message on the create step, never an exception in render.
    const stagedFiles = {
      adapterAsset: staged?.adapterAsset ?? adapterFile.trim(),
      driverFile: resolveDriverFile({ adapter, stagedDriverFile: staged?.driverFile, userJarPath, bucketFiles: probe?.bucketFiles ?? [] }),
      luaSource: staged?.luaSource ?? undefined,
    };
    return tryBuildPlan(adapter, values, names, stagedFiles, { installScripts: needsScriptInstall(missingInDb, staged !== null) });
  }, [adapter, values, names, staged, userJarPath, adapterFile, missingInDb, probe]);

  const canNext =
    step === 0 ? adapter !== null
    : step === 1 ? adapter !== null && credentialsComplete(adapter, values)
    : step === 2 ? namesComplete(names)
    : step === 3 && adapter ? readyToCreate({
        adapter,
        managedLocal,
        missingCount: missing.length,
        staged: staged !== null,
        adapterFile,
        driverFile: userJarPath.split("/").pop() ?? "",
      })
    : false;

  // Every JDBC source has a driver prefix to register — the Lua Databricks adapter included.
  const jdbcUrl = adapter?.kind === "jdbc" ? adapter.connection(values).to : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        {adapter ? <SourceLogo logo={adapter.logo} className="h-5 w-5" /> : null}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13.5px] font-semibold text-foreground">
            Add a data source{adapter ? ` — ${adapter.name}` : ""} <span className="font-normal text-muted-foreground">→ {connectionName}</span>
          </h2>
          <p className="text-[11px] text-muted-foreground">
            The source appears here as a read-only schema you can join like any table — live, not copied.
          </p>
        </div>
        <ol className="hidden items-center gap-1 text-[11px] md:flex">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-1">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5",
                  i === step ? "bg-primary text-primary-foreground" : i < step ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {i < STEPS.length - 1 ? <ChevronRight className="h-3 w-3 text-muted-foreground/60" /> : null}
            </li>
          ))}
        </ol>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto w-full max-w-[880px]">
          {probeError ? (
            <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
              Could not read this database’s adapters: {probeError}
            </p>
          ) : null}
          {step === 0 ? <SourcePicker selected={adapter} onSelect={pick} /> : null}
          {step === 1 && adapter ? <CredentialsStep adapter={adapter} values={values} onChange={setValues} managedLocal={managedLocal} hostAddress={localState?.hostAddress ?? null} /> : null}
          {step === 2 ? <OptionsStep names={names} onChange={setNames} /> : null}
          {step === 3 && adapter ? (
            <PrerequisitesStep
              adapter={adapter}
              missing={missing}
              managedLocal={managedLocal}
              jdbcUrl={jdbcUrl}
              userJarPath={userJarPath}
              onUserJarPath={setUserJarPath}
              adapterFile={adapterFile}
              onAdapterFile={setAdapterFile}
              staged={staged}
              onStaged={setStaged}
            />
          ) : null}
          {step === 4 && adapter && planError ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-foreground">
              This source cannot be created yet: {planError}. Go back to Prerequisites and install or name the missing file.
            </p>
          ) : step === 4 && adapter ? (
            <CreateStep
              key={`${adapter.id}:${names.virtualSchema}`}
              profileId={profileId}
              connectionName={connectionName}
              plan={plan}
              schemaName={names.virtualSchema}
              connectionObjectName={names.connection}
              prove={adapter.prove}
              onCreated={(r) => onCreated({ ...r, schema: names.virtualSchema })}
            />
          ) : null}
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-border px-4 py-2">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        {step < 4 ? (
          <button
            type="button"
            data-agent-id="add-source.next"
            onClick={() => setStep((s) => Math.min(4, s + 1))}
            disabled={!canNext}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-40"
          >
            {step === 3 ? "Review and create" : "Next"} <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : <span />}
      </footer>
    </div>
  );
}
