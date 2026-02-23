type RailwayGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

type RailwayEnvironmentCreateData = {
  environmentCreate?: { id: string; name: string };
};

type RailwayVariableUpsertData = {
  variableCollectionUpsert?: { id?: string } | null;
};

type RailwayDeploymentCreateData = {
  deploymentCreate?: { id: string; status?: string };
};

type CreateRailwayInstanceInput = {
  userEmail: string;
  plan: string;
  provider: string;
  channels: string[];
  providerApiKey?: string;
};

type CreateRailwayInstanceResult = {
  environmentId: string;
  projectId: string;
  serviceId: string;
  consoleUrl: string;
};

const DEFAULT_ENDPOINT = "https://backboard.railway.com/graphql/v2";

async function railwayGql<T>(query: string, variables: Record<string, unknown>) {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) {
    throw new Error("Missing RAILWAY_API_TOKEN");
  }

  const endpoint = process.env.RAILWAY_GRAPHQL_ENDPOINT || DEFAULT_ENDPOINT;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Railway API request failed (${res.status})`);
  }

  const json = (await res.json()) as RailwayGraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Railway API returned no data");
  }
  return json.data;
}

function normalizeEnvName(email: string) {
  const base = email.split("@")[0] || "user";
  const cleaned = base.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  const suffix = Date.now().toString(36);
  return `nc-${cleaned}-${suffix}`.slice(0, 48);
}

export async function createRailwayInstanceForUser(
  input: CreateRailwayInstanceInput,
): Promise<CreateRailwayInstanceResult> {
  const projectId = process.env.RAILWAY_PROJECT_ID;
  const serviceId = process.env.RAILWAY_SERVICE_ID;
  const sourceEnvironmentId = process.env.RAILWAY_BASE_ENVIRONMENT_ID;

  if (!projectId || !serviceId || !sourceEnvironmentId) {
    throw new Error(
      "Missing Railway owner env vars: RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID, RAILWAY_BASE_ENVIRONMENT_ID",
    );
  }

  const envName = normalizeEnvName(input.userEmail);

  const createEnvironmentMutation = `
    mutation CreateEnvironment($input: EnvironmentCreateInput!) {
      environmentCreate(input: $input) {
        id
        name
      }
    }
  `;

  const created = await railwayGql<RailwayEnvironmentCreateData>(createEnvironmentMutation, {
    input: {
      projectId,
      name: envName,
      sourceEnvironmentId,
    },
  });

  const environmentId = created.environmentCreate?.id;
  if (!environmentId) {
    throw new Error("Railway environment creation failed");
  }

  const variableMutation = `
    mutation UpsertVars($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input) {
        id
      }
    }
  `;

  const variables: Record<string, string> = {
    NEURALCLUB_USER_EMAIL: input.userEmail,
    NEURALCLUB_PLAN: input.plan,
    NEURALCLUB_PROVIDER: input.provider,
    NEURALCLUB_CHANNELS: input.channels.join(","),
  };

  if (input.providerApiKey) {
    variables.NEURALCLAW_PROVIDER_API_KEY = input.providerApiKey;
  }

  await railwayGql<RailwayVariableUpsertData>(variableMutation, {
    input: {
      projectId,
      environmentId,
      serviceId,
      replace: false,
      variables,
    },
  });

  const deploymentMutation = `
    mutation TriggerDeploy($input: DeploymentCreateInput!) {
      deploymentCreate(input: $input) {
        id
        status
      }
    }
  `;

  try {
    await railwayGql<RailwayDeploymentCreateData>(deploymentMutation, {
      input: { projectId, environmentId, serviceId },
    });
  } catch {
    // Environment creation already produces an instance; deploy trigger can vary by API version.
  }

  return {
    environmentId,
    projectId,
    serviceId,
    consoleUrl: `https://railway.com/project/${projectId}?environmentId=${environmentId}`,
  };
}

