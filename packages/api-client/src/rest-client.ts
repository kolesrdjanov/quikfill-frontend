import {
  authTokensSchema,
  handoffCodeSchema,
  betaUserSchema,
  analyticsResponseSchema,
  inviteBetaUserInputSchema,
  createDomainInputSchema,
  createEntityRecordInputSchema,
  createEntityTypeInputSchema,
  createFieldMappingInputSchema,
  createFormProfileInputSchema,
  createFillRunInputSchema,
  createGeneratorPresetInputSchema,
  domainSchema,
  entityRecordSchema,
  entityTypeSchema,
  fieldMappingSchema,
  fillRunSchema,
  updateFillRunInputSchema,
  formProfileMatchCandidateSchema,
  formProfileMatchInputSchema,
  formProfileSchema,
  generatorPresetSchema,
  magicLinkRequestedSchema,
  userAccountSchema,
  accountExportSchema,
  extensionSettingsSchema,
  entitlementsResponseSchema,
  createCheckoutSessionInputSchema,
  sessionUrlResponseSchema,
} from '@quikfill/schemas'
import type {
  AuthTokens,
  HandoffCode,
  BetaUser,
  AnalyticsResponse,
  AnalyticsQueryParams,
  InviteBetaUserInput,
  CreateDomainInput,
  CreateEntityRecordInput,
  CreateEntityTypeInput,
  CreateFieldMappingInput,
  CreateFillRunInput,
  CreateFormProfileInput,
  CreateGeneratorPresetInput,
  Domain,
  EntityRecord,
  EntityType,
  FieldMapping,
  FillRun,
  UpdateFillRunInput,
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
  ExtensionSettings,
  UserAccount,
  AccountExport,
  Entitlements,
  CreateCheckoutSessionInput,
  SessionUrlResponse,
} from '@quikfill/schemas'
import { createRestClient } from './http'
import type { RestClient, RestClientConfig } from './http'

export interface ApiClient {
  rest: RestClient
  auth: {
    requestMagicLink(email: string, signal?: AbortSignal): Promise<MagicLinkRequested>
    verify(email: string, code: string, signal?: AbortSignal): Promise<AuthTokens>
    refresh(refreshToken: string, signal?: AbortSignal): Promise<AuthTokens>
    logout(refreshToken: string, signal?: AbortSignal): Promise<void>
    /** Mint a single-use code that hands the current (authenticated) session to another surface. */
    createHandoff(signal?: AbortSignal): Promise<HandoffCode>
    /** Redeem a handoff code for a brand-new, independent session (no auth required). */
    redeemHandoff(code: string, signal?: AbortSignal): Promise<AuthTokens>
  }
  users: {
    me(signal?: AbortSignal): Promise<UserAccount>
    updateMe(input: UpdateProfileInput, signal?: AbortSignal): Promise<UserAccount>
    /** Replace the dashboard-managed extension settings (full object). */
    updateSettings(input: ExtensionSettings, signal?: AbortSignal): Promise<UserAccount>
    /** Download every record QuikFill holds for the user (GDPR/CCPA export). */
    exportData(signal?: AbortSignal): Promise<AccountExport>
    /** Permanently delete the account and all associated data. */
    deleteAccount(signal?: AbortSignal): Promise<void>
  }
  admin: {
    /** List the beta-access allowlist (admin only). */
    listBetaUsers(signal?: AbortSignal): Promise<BetaUser[]>
    /** Invite an email to the beta (admin only). Idempotent. */
    inviteBetaUser(input: InviteBetaUserInput, signal?: AbortSignal): Promise<BetaUser>
    /** Remove an email from the beta allowlist (admin only). */
    removeBetaUser(id: string, signal?: AbortSignal): Promise<void>
    /** Usage / token / cost / margin analytics across all users (admin only). */
    analytics(params: AnalyticsQueryParams, signal?: AbortSignal): Promise<AnalyticsResponse>
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
    create(input: CreateFillRunInput, signal?: AbortSignal): Promise<FillRun>
    update(id: string, input: UpdateFillRunInput, signal?: AbortSignal): Promise<FillRun>
  }
  subscriptions: {
    /** Current plan, token usage and limits for the signed-in user. */
    entitlements(signal?: AbortSignal): Promise<Entitlements>
    /** Start a Stripe Checkout for a paid plan; returns the hosted URL. */
    createCheckoutSession(
      input: CreateCheckoutSessionInput,
      signal?: AbortSignal,
    ): Promise<SessionUrlResponse>
    /** Open the Stripe Customer Portal (cards, invoices, cancel); returns the URL. */
    createPortalSession(signal?: AbortSignal): Promise<SessionUrlResponse>
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
      verify: (email, code, signal) =>
        rest.post(
          '/auth/verify',
          { email, code },
          { schema: authTokensSchema, skipAuth: true, signal },
        ),
      refresh: (refreshToken, signal) =>
        rest.post(
          '/auth/refresh',
          { refreshToken },
          { schema: authTokensSchema, skipAuth: true, signal },
        ),
      logout: (refreshToken, signal) =>
        rest.post('/auth/logout', { refreshToken }, { skipAuth: true, signal }),
      createHandoff: (signal) =>
        rest.post('/auth/handoff', undefined, { schema: handoffCodeSchema, signal }),
      redeemHandoff: (code, signal) =>
        rest.post(
          '/auth/handoff/redeem',
          { code },
          { schema: authTokensSchema, skipAuth: true, signal },
        ),
    },

    users: {
      me: (signal) => rest.get('/users/me', { schema: userAccountSchema, signal }),
      updateMe: (input, signal) =>
        rest.patch('/users/me', input, { schema: userAccountSchema, signal }),
      updateSettings: (input, signal) =>
        rest.patch('/users/me/settings', extensionSettingsSchema.parse(input), {
          schema: userAccountSchema,
          signal,
        }),
      exportData: (signal) => rest.get('/users/me/export', { schema: accountExportSchema, signal }),
      deleteAccount: (signal) => rest.del('/users/me', { signal }),
    },

    admin: {
      listBetaUsers: (signal) =>
        rest.get('/admin/beta-users', { schema: betaUserSchema.array(), signal }),
      inviteBetaUser: (input, signal) =>
        rest.post('/admin/beta-users', inviteBetaUserInputSchema.parse(input), {
          schema: betaUserSchema,
          signal,
        }),
      removeBetaUser: (id, signal) => rest.del(`/admin/beta-users/${id}`, { signal }),
      analytics: (params, signal) =>
        rest.get('/admin/analytics', {
          query: {
            period: params.period,
            page: params.page,
            pageSize: params.pageSize,
            sort: params.sort,
            order: params.order,
          },
          schema: analyticsResponseSchema,
          signal,
        }),
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
      create: (input, signal) =>
        rest.post('/fill-runs', createFillRunInputSchema.parse(input), {
          schema: fillRunSchema,
          signal,
        }),
      update: (id, input, signal) =>
        rest.patch(`/fill-runs/${id}`, updateFillRunInputSchema.parse(input), {
          schema: fillRunSchema,
          signal,
        }),
    },

    subscriptions: {
      entitlements: (signal) =>
        rest.get('/entitlements', { schema: entitlementsResponseSchema, signal }),
      createCheckoutSession: (input, signal) =>
        rest.post(
          '/subscriptions/checkout-session',
          createCheckoutSessionInputSchema.parse(input),
          {
            schema: sessionUrlResponseSchema,
            signal,
          },
        ),
      createPortalSession: (signal) =>
        rest.post('/subscriptions/portal-session', undefined, {
          schema: sessionUrlResponseSchema,
          signal,
        }),
    },
  }
}
