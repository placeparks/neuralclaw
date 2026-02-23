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

export type RailwayProvisionInput = {
  serviceName: string;
  variables: Record<string, string>;
};

const RAILWAY_ENDPOINT = "https://backboard.railway.app/graphql/v2";

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = mustEnv("RAILWAY_API_TOKEN");

  const res = await fetch(RAILWAY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });

  if (!res.ok) {
    throw new Error(`Railway API error: HTTP ${res.status}`);
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
  const repo = process.env.RAILWAY_RUNTIME_TEMPLATE_REPO || process.env.RAILWAY_TEMPLATE_REPO;
  const branch = process.env.RAILWAY_RUNTIME_TEMPLATE_BRANCH || process.env.RAILWAY_TEMPLATE_BRANCH || "main";

  if (!repo) {
    throw new Error("Missing required env var: RAILWAY_RUNTIME_TEMPLATE_REPO (or legacy RAILWAY_TEMPLATE_REPO)");
  }

  const candidates = [
    {
      query: `
        mutation CreateService($projectId: String!, $name: String!, $repo: String!, $branch: String) {
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
      pick: (data: CreateServiceData) => data.serviceCreate?.id
    },
    {
      query: `
        mutation CreateServiceRepo($projectId: String!, $name: String!, $repo: String!, $branch: String) {
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
      pick: (data: CreateServiceData) => data.serviceCreateFromRepo?.id
    }
  ];

  let lastErr = "Unknown create service error";

  for (const candidate of candidates) {
    try {
      const data = await graphql<CreateServiceData>(candidate.query, {
        projectId,
        name: serviceName,
        repo,
        branch
      });
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

  const candidates = [
    `
      mutation UpsertVars($projectId: String!, $environmentId: String!, $serviceId: String!, $variables: [VariableInput!]!) {
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
    `
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
    `
  ];

  let lastErr = "Unknown variable upsert error";

  for (const query of candidates) {
    try {
      await graphql<UpsertVarsData>(query, {
        projectId,
        environmentId,
        serviceId,
        variables
      });
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

export async function provisionOnRailway(input: RailwayProvisionInput): Promise<{
  serviceId: string;
  deploymentId: string | null;
}> {
  const serviceId = await createService(input.serviceName);
  await upsertVariables(serviceId, input.variables);
  const deploymentId = await triggerDeployment(serviceId);

  return { serviceId, deploymentId };
}
