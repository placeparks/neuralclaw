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
type ServiceSourceQuery = {
  service: {
    serviceInstances: {
      nodes: Array<{
        environmentId: string;
        source: { image?: string; repo?: string } | null;
      }>;
    };
  };
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

/**
 * Query the source service to discover its Docker image or GitHub repo.
 * Falls back to RAILWAY_SOURCE_IMAGE env var if set.
 */
async function resolveSource(
  sourceServiceId: string,
  environmentId: string,
): Promise<{ image?: string; repo?: string } | null> {
  // Explicit override takes priority
  const envImage = process.env.RAILWAY_SOURCE_IMAGE;
  if (envImage) return { image: envImage };

  const query = `
    query GetServiceSource($serviceId: String!) {
      service(id: $serviceId) {
        serviceInstances {
          nodes {
            environmentId
            source {
              image
              repo
            }
          }
        }
      }
    }
  `;

  try {
    const data = await railwayGql<ServiceSourceQuery>(query, { serviceId: sourceServiceId });
    const nodes = data.service?.serviceInstances?.nodes ?? [];
    // Prefer the matching environment, fall back to first node
    const match = nodes.find((n) => n.environmentId === environmentId) ?? nodes[0];
    return match?.source ?? null;
  } catch (error) {
    throw new Error(
      `Failed to resolve source from template service ${sourceServiceId}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

/**
 * Explicitly trigger a deployment for the new service.
 * Non-fatal — the service may already auto-build when a source is attached.
 */
async function triggerDeploy(serviceId: string, environmentId: string): Promise<void> {
  const attempts = [
    {
      query: `
        mutation ServiceInstanceDeployV2($serviceId: String!, $environmentId: String!) {
          serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
        }
      `,
      vars: { serviceId, environmentId },
    },
    {
      query: `
        mutation ServiceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
          serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
        }
      `,
      vars: { serviceId, environmentId },
    },
    {
      query: `
        mutation ServiceInstanceDeploy($serviceId: String!, $environmentId: String!) {
          serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
        }
      `,
      vars: { serviceId, environmentId },
    },
  ];

  let lastError = "";
  for (const attempt of attempts) {
    try {
      await railwayGql<Record<string, unknown>>(attempt.query, attempt.vars);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown deploy trigger error";
    }
  }
  throw new Error(`Failed to trigger first deployment: ${lastError}`);
}

async function createService(
  projectId: string,
  sourceServiceId: string,
  environmentId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const mutation = `
    mutation ServiceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
      }
    }
  `;

  const src = await resolveSource(sourceServiceId, environmentId);
  if (!src?.image && !src?.repo) {
    throw new Error(
      "Template service source could not be resolved. Set RAILWAY_SOURCE_IMAGE or use a template service with a valid source.",
    );
  }

  const input: Record<string, unknown> = { projectId, name };
  if (src?.image) {
    input.source = { image: src.image };
  } else if (src?.repo) {
    input.source = { repo: src.repo };
  }
  const created = await railwayGql<ServiceCreateData>(mutation, { input });
  if (!created.serviceCreate?.id) {
    throw new Error("serviceCreate returned no id");
  }

  return {
    id: created.serviceCreate.id,
    name: created.serviceCreate.name || name,
  };
}

async function updateServiceInstance(
  serviceId: string,
  environmentId: string,
): Promise<void> {
  const startCommand = process.env.RAILWAY_AGENT_START_COMMAND || "python -m neuralclaw.cli gateway";
  const mutation = `
    mutation ServiceInstanceUpdate($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
  `;
  try {
    await railwayGql<{ serviceInstanceUpdate?: boolean }>(mutation, {
      serviceId,
      environmentId,
      input: {
        startCommand,
        restartPolicyType: "ON_FAILURE",
        restartPolicyMaxRetries: 10,
      },
    });
  } catch {
    // Non-fatal: keep default service settings if mutation isn't available.
  }
}

// Maps the provider name to the env var name neuralclaw reads from the environment
const PROVIDER_KEY_ENV: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

function buildServiceVariables(input: CreateRailwayServiceInput): Record<string, string> {
  // Identity vars so the gateway knows which user/plan/provider it serves
  const variables: Record<string, string> = {
    NEURALCLUB_USER_EMAIL: input.userEmail,
    NEURALCLUB_PLAN: input.plan,
    NEURALCLUB_PROVIDER: input.provider,
    NEURALCLUB_CHANNELS: input.channels.join(","),
  };

  // Provider API key — set under the name neuralclaw reads (e.g. OPENAI_API_KEY)
  if (input.providerApiKey) {
    const envName = PROVIDER_KEY_ENV[input.provider.toLowerCase()] ?? "NEURALCLAW_PROVIDER_API_KEY";
    variables[envName] = input.providerApiKey;
  }

  // Channel credentials
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
      "Missing owner env vars: RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID, RAILWAY_BASE_ENVIRONMENT_ID",
    );
  }

  const serviceName = normalizeServiceName(input.userEmail);
  const createdService = await createService(projectId, sourceServiceId, environmentId, serviceName);

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

  try {
    await railwayGql<VariableUpsertData>(variableMutation, {
      projectId,
      serviceId: createdService.id,
      environmentId,
      variables: buildServiceVariables(input),
    });
  } catch (error) {
    throw new Error(
      `variableCollectionUpsert failed for service ${createdService.id}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  await updateServiceInstance(createdService.id, environmentId);

  // Trigger deployment after variables are set so the service starts with correct env
  await triggerDeploy(createdService.id, environmentId);

  return {
    projectId,
    serviceId: createdService.id,
    environmentId,
    serviceName: createdService.name,
    consoleUrl: `https://railway.com/project/${projectId}/service/${createdService.id}?environmentId=${environmentId}`,
  };
}
