type RailwayGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

type CreateRailwayServiceInput = {
  userEmail: string;
  plan: string;
  provider: string;
  channels: string[];
  providerApiKey?: string;
  channelSecrets?: {
    telegramBotToken?: string;
    discordBotToken?: string;
    slackBotToken?: string;
    slackAppToken?: string;
    whatsappSession?: string;
    signalPhone?: string;
  };
};

type CreateRailwayServiceResult = {
  projectId: string;
  serviceId: string;
  environmentId: string;
  serviceName: string;
  consoleUrl: string;
};

type ServiceCreateData = { serviceCreate?: { id: string; name?: string } };
type VariableUpsertData = { variableCollectionUpsert?: boolean | null };
type DeploymentCreateData = { deploymentCreate?: { id: string; status?: string } };

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

  const raw = await res.text();
  let json: RailwayGraphQLResponse<T> | null = null;
  try {
    json = JSON.parse(raw) as RailwayGraphQLResponse<T>;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const detail = json?.errors?.map((e) => e.message).join("; ") || raw || "No response body";
    throw new Error(`Railway API request failed (${res.status}): ${detail}`);
  }

  if (!json) {
    throw new Error("Railway API returned non-JSON response");
  }

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Railway API returned no data");
  }

  return json.data;
}

function normalizeServiceName(email: string) {
  const base = email.split("@")[0] || "user";
  const cleaned = base.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  const suffix = Date.now().toString(36);
  return `neuralclaw-${cleaned}-${suffix}`.slice(0, 58);
}

async function createService(
  projectId: string,
  sourceServiceId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const mutationA = `
    mutation ServiceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
      }
    }
  `;

  const created = await railwayGql<ServiceCreateData>(mutationA, {
    input: {
      projectId,
      name,
      sourceServiceId,
    },
  });

  if (!created.serviceCreate?.id) {
    throw new Error("Railway service creation returned no service ID");
  }

  return {
    id: created.serviceCreate.id,
    name: created.serviceCreate.name || name,
  };
}

function buildServiceVariables(input: CreateRailwayServiceInput): Record<string, string> {
  const variables: Record<string, string> = {
    NEURALCLUB_USER_EMAIL: input.userEmail,
    NEURALCLUB_PLAN: input.plan,
    NEURALCLUB_PROVIDER: input.provider,
    NEURALCLUB_CHANNELS: input.channels.join(","),
  };

  if (input.providerApiKey) variables.NEURALCLAW_PROVIDER_API_KEY = input.providerApiKey;
  if (input.channelSecrets?.telegramBotToken) variables.NEURALCLAW_TELEGRAM_TOKEN = input.channelSecrets.telegramBotToken;
  if (input.channelSecrets?.discordBotToken) variables.NEURALCLAW_DISCORD_TOKEN = input.channelSecrets.discordBotToken;
  if (input.channelSecrets?.slackBotToken) variables.NEURALCLAW_SLACK_BOT_TOKEN = input.channelSecrets.slackBotToken;
  if (input.channelSecrets?.slackAppToken) variables.NEURALCLAW_SLACK_APP_TOKEN = input.channelSecrets.slackAppToken;
  if (input.channelSecrets?.whatsappSession) variables.NEURALCLAW_WHATSAPP_SESSION = input.channelSecrets.whatsappSession;
  if (input.channelSecrets?.signalPhone) variables.NEURALCLAW_SIGNAL_PHONE = input.channelSecrets.signalPhone;

  return variables;
}

export async function createRailwayServiceForUser(
  input: CreateRailwayServiceInput,
): Promise<CreateRailwayServiceResult> {
  const projectId = process.env.RAILWAY_PROJECT_ID;
  const sourceServiceId = process.env.RAILWAY_SERVICE_ID;
  const environmentId = process.env.RAILWAY_BASE_ENVIRONMENT_ID;

  if (!projectId || !sourceServiceId || !environmentId) {
    throw new Error(
      "Missing owner env vars: RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID (template service), RAILWAY_BASE_ENVIRONMENT_ID",
    );
  }

  const serviceName = normalizeServiceName(input.userEmail);
  const createdService = await createService(projectId, sourceServiceId, serviceName);

  const variableMutation = `
    mutation VariableCollectionUpsert(
      $projectId: String!,
      $serviceId: String!,
      $environmentId: String!,
      $variables: EnvironmentVariables!
    ) {
      variableCollectionUpsert(
        input: {
          projectId: $projectId,
          environmentId: $environmentId,
          serviceId: $serviceId,
          variables: $variables
        }
      )
    }
  `;

  await railwayGql<VariableUpsertData>(variableMutation, {
    projectId,
    serviceId: createdService.id,
    environmentId,
    variables: buildServiceVariables(input),
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
    await railwayGql<DeploymentCreateData>(deploymentMutation, {
      input: {
        projectId,
        environmentId,
        serviceId: createdService.id,
      },
    });
  } catch {
    // Some Railway setups auto-deploy on service creation.
  }

  return {
    projectId,
    serviceId: createdService.id,
    environmentId,
    serviceName: createdService.name,
    consoleUrl: `https://railway.com/project/${projectId}/service/${createdService.id}?environmentId=${environmentId}`,
  };
}
