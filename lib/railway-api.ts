type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

type CreateServiceData = {
  serviceCreate?: { id: string; name?: string };
  serviceCreateFromRepo?: { id: string; name?: string };
};

type UpsertVarsData = {
  variableCollectionUpsert?: { updated?: number };
  variablesUpsert?: { updated?: number };
};

type DeployData = {
  deploymentCreate?: { id: string; status?: string };
  serviceInstanceDeploy?: { id: string; status?: string };
};

type ServiceDomainData = {
  service?: {
    domains?: Array<{ domain?: string; name?: string }>;
    serviceDomains?: Array<{ domain?: string; name?: string }>;
  };
};

export type RailwayProvisionInput = {
  serviceName: string;
  variables: Record<string, string>;
};

const DEFAULT_RAILWAY_ENDPOINT = "https://backboard.railway.app/graphql/v2";

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function railwayToken(): string {
  return process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_TOKEN || "";
}

function railwayEndpoint(): string {
  return process.env.RAILWAY_GRAPHQL_ENDPOINT || DEFAULT_RAILWAY_ENDPOINT;
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = railwayToken();
  if (!token) {
    throw new Error("Missing required env var: RAILWAY_API_TOKEN (or RAILWAY_TOKEN)");
  }

  const res = await fetch(railwayEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const detail = body ? ` | ${body.slice(0, 800)}` : "";
    throw new Error(`Railway API error: HTTP ${res.status}${detail}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join(" | "));
  }

  if (!json.data) {
    throw new Error("Railway API returned no data");
  }

  return json.data;
}

async function createService(serviceName: string): Promise<string> {
  const projectId = mustEnv("RAILWAY_PROJECT_ID");
  const sourceImage = process.env.RAILWAY_SOURCE_IMAGE;
  const repo = process.env.RAILWAY_RUNTIME_TEMPLATE_REPO || process.env.RAILWAY_TEMPLATE_REPO;
  const branch = process.env.RAILWAY_RUNTIME_TEMPLATE_BRANCH || process.env.RAILWAY_TEMPLATE_BRANCH || "main";

  if (!sourceImage && !repo) {
    throw new Error(
      "Missing runtime source. Set RAILWAY_SOURCE_IMAGE or RAILWAY_RUNTIME_TEMPLATE_REPO (legacy: RAILWAY_TEMPLATE_REPO)."
    );
  }

  const candidates: Array<{
    enabled: boolean;
    query: string;
    vars: Record<string, unknown>;
    pick: (data: CreateServiceData) => string | undefined;
  }> = [
    {
      enabled: Boolean(sourceImage),
      query: `
        mutation CreateServiceImage($projectId: String!, $name: String!, $image: String!) {
          serviceCreate(input: {
            projectId: $projectId,
            name: $name,
            source: { image: $image }
          }) {
            id
            name
          }
        }
      `,
      vars: { projectId, name: serviceName, image: sourceImage || "" },
      pick: (data: CreateServiceData) => data.serviceCreate?.id
    },
    {
      enabled: Boolean(repo),
      query: `
        mutation CreateServiceRepoSource($projectId: String!, $name: String!, $repo: String!, $branch: String) {
          serviceCreate(input: {
            projectId: $projectId,
            name: $name,
            source: { repo: $repo, branch: $branch }
          }) {
            id
            name
          }
        }
      `,
      vars: { projectId, name: serviceName, repo: repo || "", branch },
      pick: (data: CreateServiceData) => data.serviceCreate?.id
    },
    {
      enabled: Boolean(repo),
      query: `
        mutation CreateServiceFromRepo($projectId: String!, $name: String!, $repo: String!, $branch: String) {
          serviceCreateFromRepo(input: {
            projectId: $projectId,
            name: $name,
            repo: $repo,
            branch: $branch
          }) {
            id
            name
          }
        }
      `,
      vars: { projectId, name: serviceName, repo: repo || "", branch },
      pick: (data: CreateServiceData) => data.serviceCreateFromRepo?.id
    }
  ];

  let lastErr = "Unknown create service error";

  for (const candidate of candidates.filter((c) => c.enabled)) {
    try {
      const data = await graphql<CreateServiceData>(candidate.query, candidate.vars);
      const id = candidate.pick(data);
      if (id) {
        return id;
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Unable to create Railway service. ${lastErr}`);
}

async function upsertVariables(serviceId: string, vars: Record<string, string>): Promise<void> {
  const projectId = mustEnv("RAILWAY_PROJECT_ID");
  const environmentId = mustEnv("RAILWAY_ENVIRONMENT_ID");

  const variables = Object.entries(vars).map(([name, value]) => ({ name, value }));

  const candidates: Array<{ query: string; vars: Record<string, unknown> }> = [
    {
      query: `
        mutation UpsertVarsMap($projectId: String!, $environmentId: String!, $serviceId: String!, $variables: EnvironmentVariables!) {
          variableCollectionUpsert(input: {
            projectId: $projectId,
            environmentId: $environmentId,
            serviceId: $serviceId,
            variables: $variables
          })
        }
      `,
      vars: { projectId, environmentId, serviceId, variables: vars }
    },
    {
      query: `
        mutation UpsertVarsList($projectId: String!, $environmentId: String!, $serviceId: String!, $variables: [VariableInput!]!) {
          variableCollectionUpsert(input: {
            projectId: $projectId,
            environmentId: $environmentId,
            serviceId: $serviceId,
            variables: $variables
          }) {
            updated
          }
        }
      `,
      vars: { projectId, environmentId, serviceId, variables }
    },
    {
      query: `
        mutation UpsertVarsAlt($projectId: String!, $environmentId: String!, $serviceId: String!, $variables: [VariableInput!]!) {
          variablesUpsert(input: {
            projectId: $projectId,
            environmentId: $environmentId,
            serviceId: $serviceId,
            variables: $variables
          }) {
            updated
          }
        }
      `,
      vars: { projectId, environmentId, serviceId, variables }
    }
  ];

  let lastErr = "Unknown variable upsert error";

  for (const candidate of candidates) {
    try {
      await graphql<UpsertVarsData>(candidate.query, candidate.vars);
      return;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Unable to set Railway variables. ${lastErr}`);
}

async function triggerDeployment(serviceId: string): Promise<string | null> {
  const environmentId = mustEnv("RAILWAY_ENVIRONMENT_ID");

  const candidates = [
    {
      query: `
        mutation DeployServiceV2($environmentId: String!, $serviceId: String!) {
          serviceInstanceDeployV2(environmentId: $environmentId, serviceId: $serviceId)
        }
      `,
      pick: () => null
    },
    {
      query: `
        mutation DeployService($environmentId: String!, $serviceId: String!) {
          deploymentCreate(input: {
            environmentId: $environmentId,
            serviceId: $serviceId
          }) {
            id
            status
          }
        }
      `,
      pick: (data: DeployData) => data.deploymentCreate?.id || null
    },
    {
      query: `
        mutation DeployServiceAlt($environmentId: String!, $serviceId: String!) {
          serviceInstanceDeploy(input: {
            environmentId: $environmentId,
            serviceId: $serviceId
          }) {
            id
            status
          }
        }
      `,
      pick: (data: DeployData) => data.serviceInstanceDeploy?.id || null
    }
  ];

  let lastErr = "Unknown deployment trigger error";

  for (const candidate of candidates) {
    try {
      const data = await graphql<DeployData>(candidate.query, {
        environmentId,
        serviceId
      });
      return candidate.pick(data);
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Unable to trigger Railway deployment. ${lastErr}`);
}

export async function generateServiceDomain(serviceId: string): Promise<string | null> {
  const environmentId = mustEnv("RAILWAY_ENVIRONMENT_ID");

  type DomainData = { serviceDomainCreate?: { domain?: string } };

  const candidates = [
    {
      query: `
        mutation GenerateDomain($serviceId: String!, $environmentId: String!) {
          serviceDomainCreate(input: {
            serviceId: $serviceId,
            environmentId: $environmentId
          }) {
            domain
          }
        }
      `,
      pick: (data: DomainData) => data.serviceDomainCreate?.domain || null
    },
    {
      // Older Railway API shape
      query: `
        mutation GenerateDomainAlt($serviceId: String!, $environmentId: String!) {
          serviceDomainCreate(serviceId: $serviceId, environmentId: $environmentId) {
            domain
          }
        }
      `,
      pick: (data: DomainData) => data.serviceDomainCreate?.domain || null
    }
  ];

  for (const candidate of candidates) {
    try {
      const data = await graphql<DomainData>(candidate.query, { serviceId, environmentId });
      const raw = candidate.pick(data);
      if (raw) {
        return raw.startsWith("http") ? raw : `https://${raw}`;
      }
    } catch {
      continue;
    }
  }

  // Domain creation failed (already exists, or API changed) — try reading existing ones.
  return resolveServiceEndpoint(serviceId);
}

export async function provisionOnRailway(input: RailwayProvisionInput): Promise<{
  serviceId: string;
  deploymentId: string | null;
  domain: string | null;
}> {
  const serviceId = await createService(input.serviceName);
  await upsertVariables(serviceId, input.variables);
  const domain = await generateServiceDomain(serviceId);
  const deploymentId = await triggerDeployment(serviceId);

  return { serviceId, deploymentId, domain };
}

export async function updateRailwayService(input: {
  serviceId: string;
  variables: Record<string, string>;
}): Promise<{ deploymentId: string | null }> {
  await upsertVariables(input.serviceId, input.variables);
  const deploymentId = await triggerDeployment(input.serviceId);
  return { deploymentId };
}

export async function resolveServiceEndpoint(serviceId: string): Promise<string | null> {
  const candidates = [
    `
      query ServiceDomains($id: String!) {
        service(id: $id) {
          domains { domain name }
        }
      }
    `,
    `
      query ServiceDomainsAlt($id: String!) {
        service(id: $id) {
          serviceDomains { domain name }
        }
      }
    `
  ];

  for (const query of candidates) {
    try {
      const data = await graphql<ServiceDomainData>(query, { id: serviceId });
      const raw =
        data.service?.domains ??
        data.service?.serviceDomains ??
        [];
      const found = raw
        .map((d) => d.domain || d.name || "")
        .map((d) => d.trim())
        .filter(Boolean)[0];
      if (found) {
        if (found.startsWith("http://") || found.startsWith("https://")) {
          return found;
        }
        return `https://${found}`;
      }
    } catch {
      continue;
    }
  }

  return null;
}
