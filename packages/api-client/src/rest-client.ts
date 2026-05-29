import {
  authTokensSchema,
  createDomainInputSchema,
  createEntityRecordInputSchema,
  createEntityTypeInputSchema,
  createFieldMappingInputSchema,
  createFormProfileInputSchema,
  createGeneratorPresetInputSchema,
  domainSchema,
  entityRecordSchema,
  entityTypeSchema,
  fieldMappingSchema,
  fillRunSchema,
  formProfileMatchCandidateSchema,
  formProfileMatchInputSchema,
  formProfileSchema,
  generatorPresetSchema,
  magicLinkRequestedSchema,
  userAccountSchema,
} from '@quikfill/schemas'
import type {
  AuthTokens,
  CreateDomainInput,
  CreateEntityRecordInput,
  CreateEntityTypeInput,
  CreateFieldMappingInput,
  CreateFormProfileInput,
  CreateGeneratorPresetInput,
  Domain,
  EntityRecord,
  EntityType,
  FieldMapping,
  FillRun,
  FormProfile,
  FormProfileMatchCandidate,
  FormProfileMatchInput,
  GeneratorPreset,
  MagicLinkRequested,
  UpdateDomainInput,
  UpdateEntityRecordInput,
  UpdateEntityTypeInput,
  UpdateFieldMappingInput,
  UpdateFormProfileInput,
  UpdateGeneratorPresetInput,
  UpdateProfileInput,
  UserAccount,
} from '@quikfill/schemas'
import { createRestClient } from './http'
import type { RestClient, RestClientConfig } from './http'

export interface ApiClient {
  rest: RestClient
  auth: {
    requestMagicLink(email: string, signal?: AbortSignal): Promise<MagicLinkRequested>
    verify(token: string, signal?: AbortSignal): Promise<AuthTokens>
    refresh(refreshToken: string, signal?: AbortSignal): Promise<AuthTokens>
    logout(refreshToken: string, signal?: AbortSignal): Promise<void>
  }
  users: {
    me(signal?: AbortSignal): Promise<UserAccount>
    updateMe(input: UpdateProfileInput, signal?: AbortSignal): Promise<UserAccount>
  }
  entityTypes: {
    list(signal?: AbortSignal): Promise<EntityType[]>
    get(id: string, signal?: AbortSignal): Promise<EntityType>
    create(input: CreateEntityTypeInput, signal?: AbortSignal): Promise<EntityType>
    update(id: string, input: UpdateEntityTypeInput, signal?: AbortSignal): Promise<EntityType>
    remove(id: string, signal?: AbortSignal): Promise<void>
  }
  entityRecords: {
    list(params?: { entityTypeId?: string }, signal?: AbortSignal): Promise<EntityRecord[]>
    get(id: string, signal?: AbortSignal): Promise<EntityRecord>
    create(input: CreateEntityRecordInput, signal?: AbortSignal): Promise<EntityRecord>
    update(id: string, input: UpdateEntityRecordInput, signal?: AbortSignal): Promise<EntityRecord>
    remove(id: string, signal?: AbortSignal): Promise<void>
  }
  generatorPresets: {
    list(signal?: AbortSignal): Promise<GeneratorPreset[]>
    get(id: string, signal?: AbortSignal): Promise<GeneratorPreset>
    create(input: CreateGeneratorPresetInput, signal?: AbortSignal): Promise<GeneratorPreset>
    update(
      id: string,
      input: UpdateGeneratorPresetInput,
      signal?: AbortSignal,
    ): Promise<GeneratorPreset>
    remove(id: string, signal?: AbortSignal): Promise<void>
  }
  domains: {
    list(signal?: AbortSignal): Promise<Domain[]>
    get(id: string, signal?: AbortSignal): Promise<Domain>
    create(input: CreateDomainInput, signal?: AbortSignal): Promise<Domain>
    update(id: string, input: UpdateDomainInput, signal?: AbortSignal): Promise<Domain>
    remove(id: string, signal?: AbortSignal): Promise<void>
  }
  formProfiles: {
    list(params?: { domainId?: string }, signal?: AbortSignal): Promise<FormProfile[]>
    get(id: string, signal?: AbortSignal): Promise<FormProfile>
    create(input: CreateFormProfileInput, signal?: AbortSignal): Promise<FormProfile>
    update(id: string, input: UpdateFormProfileInput, signal?: AbortSignal): Promise<FormProfile>
    remove(id: string, signal?: AbortSignal): Promise<void>
    match(input: FormProfileMatchInput, signal?: AbortSignal): Promise<FormProfileMatchCandidate[]>
    listMappings(formProfileId: string, signal?: AbortSignal): Promise<FieldMapping[]>
    createMapping(
      formProfileId: string,
      input: CreateFieldMappingInput,
      signal?: AbortSignal,
    ): Promise<FieldMapping>
  }
  fieldMappings: {
    update(id: string, input: UpdateFieldMappingInput, signal?: AbortSignal): Promise<FieldMapping>
    remove(id: string, signal?: AbortSignal): Promise<void>
  }
  fillRuns: {
    list(
      params?: { formProfileId?: string; limit?: number },
      signal?: AbortSignal,
    ): Promise<FillRun[]>
    get(id: string, signal?: AbortSignal): Promise<FillRun>
  }
}

export function createApiClient(config: RestClientConfig): ApiClient {
  const rest = createRestClient(config)

  return {
    rest,

    auth: {
      requestMagicLink: (email, signal) =>
        rest.post(
          '/auth/magic-link',
          { email },
          { schema: magicLinkRequestedSchema, skipAuth: true, signal },
        ),
      verify: (token, signal) =>
        rest.post('/auth/verify', { token }, { schema: authTokensSchema, skipAuth: true, signal }),
      refresh: (refreshToken, signal) =>
        rest.post(
          '/auth/refresh',
          { refreshToken },
          { schema: authTokensSchema, skipAuth: true, signal },
        ),
      logout: (refreshToken, signal) =>
        rest.post('/auth/logout', { refreshToken }, { skipAuth: true, signal }),
    },

    users: {
      me: (signal) => rest.get('/users/me', { schema: userAccountSchema, signal }),
      updateMe: (input, signal) =>
        rest.patch('/users/me', input, { schema: userAccountSchema, signal }),
    },

    entityTypes: {
      list: (signal) => rest.get('/entity-types', { schema: entityTypeSchema.array(), signal }),
      get: (id, signal) => rest.get(`/entity-types/${id}`, { schema: entityTypeSchema, signal }),
      create: (input, signal) =>
        rest.post('/entity-types', createEntityTypeInputSchema.parse(input), {
          schema: entityTypeSchema,
          signal,
        }),
      update: (id, input, signal) =>
        rest.patch(`/entity-types/${id}`, input, { schema: entityTypeSchema, signal }),
      remove: (id, signal) => rest.del(`/entity-types/${id}`, { signal }),
    },

    entityRecords: {
      list: (params, signal) =>
        rest.get('/entity-records', {
          schema: entityRecordSchema.array(),
          query: { entityTypeId: params?.entityTypeId },
          signal,
        }),
      get: (id, signal) =>
        rest.get(`/entity-records/${id}`, { schema: entityRecordSchema, signal }),
      create: (input, signal) =>
        rest.post('/entity-records', createEntityRecordInputSchema.parse(input), {
          schema: entityRecordSchema,
          signal,
        }),
      update: (id, input, signal) =>
        rest.patch(`/entity-records/${id}`, input, { schema: entityRecordSchema, signal }),
      remove: (id, signal) => rest.del(`/entity-records/${id}`, { signal }),
    },

    generatorPresets: {
      list: (signal) =>
        rest.get('/generator-presets', { schema: generatorPresetSchema.array(), signal }),
      get: (id, signal) =>
        rest.get(`/generator-presets/${id}`, { schema: generatorPresetSchema, signal }),
      create: (input, signal) =>
        rest.post('/generator-presets', createGeneratorPresetInputSchema.parse(input), {
          schema: generatorPresetSchema,
          signal,
        }),
      update: (id, input, signal) =>
        rest.patch(`/generator-presets/${id}`, input, { schema: generatorPresetSchema, signal }),
      remove: (id, signal) => rest.del(`/generator-presets/${id}`, { signal }),
    },

    domains: {
      list: (signal) => rest.get('/domains', { schema: domainSchema.array(), signal }),
      get: (id, signal) => rest.get(`/domains/${id}`, { schema: domainSchema, signal }),
      create: (input, signal) =>
        rest.post('/domains', createDomainInputSchema.parse(input), {
          schema: domainSchema,
          signal,
        }),
      update: (id, input, signal) =>
        rest.patch(`/domains/${id}`, input, { schema: domainSchema, signal }),
      remove: (id, signal) => rest.del(`/domains/${id}`, { signal }),
    },

    formProfiles: {
      list: (params, signal) =>
        rest.get('/form-profiles', {
          schema: formProfileSchema.array(),
          query: { domainId: params?.domainId },
          signal,
        }),
      get: (id, signal) => rest.get(`/form-profiles/${id}`, { schema: formProfileSchema, signal }),
      create: (input, signal) =>
        rest.post('/form-profiles', createFormProfileInputSchema.parse(input), {
          schema: formProfileSchema,
          signal,
        }),
      update: (id, input, signal) =>
        rest.patch(`/form-profiles/${id}`, input, { schema: formProfileSchema, signal }),
      remove: (id, signal) => rest.del(`/form-profiles/${id}`, { signal }),
      match: (input, signal) =>
        rest.post('/form-profiles/match', formProfileMatchInputSchema.parse(input), {
          schema: formProfileMatchCandidateSchema.array(),
          signal,
        }),
      listMappings: (formProfileId, signal) =>
        rest.get(`/form-profiles/${formProfileId}/mappings`, {
          schema: fieldMappingSchema.array(),
          signal,
        }),
      createMapping: (formProfileId, input, signal) =>
        rest.post(
          `/form-profiles/${formProfileId}/mappings`,
          createFieldMappingInputSchema.parse(input),
          { schema: fieldMappingSchema, signal },
        ),
    },

    fieldMappings: {
      update: (id, input, signal) =>
        rest.patch(`/field-mappings/${id}`, input, { schema: fieldMappingSchema, signal }),
      remove: (id, signal) => rest.del(`/field-mappings/${id}`, { signal }),
    },

    fillRuns: {
      list: (params, signal) =>
        rest.get('/fill-runs', {
          schema: fillRunSchema.array(),
          query: { formProfileId: params?.formProfileId, limit: params?.limit },
          signal,
        }),
      get: (id, signal) => rest.get(`/fill-runs/${id}`, { schema: fillRunSchema, signal }),
    },
  }
}
