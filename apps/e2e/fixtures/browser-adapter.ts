import {
  DEFAULT_EXTENSION_SETTINGS,
  type AiFillRequest,
  type AiFillResponse,
} from '../../../packages/schemas/src'

export type Reply =
  | { ok: true; response: AiFillResponse }
  | { ok: false; reason: 'offline' | 'error' | 'quota' }
export const transport = {
  requests: [] as AiFillRequest[],
  reply: { ok: true, response: { values: [] } } as Reply,
  pending: false,
  values: null as Record<string, string> | null,
  resolve: null as ((reply: Reply) => void) | null,
}
export const requestEntitlements = async () => null
export const refreshEntitlements = async () => null
export const readExtensionSettings = async () => DEFAULT_EXTENSION_SETTINGS
export const onEntitlementsChange = () => () => {}
export const onExtensionSettingsChange = () => () => {}
export async function requestAiFill(request: AiFillRequest): Promise<Reply> {
  transport.requests.push(request)
  if (transport.pending)
    return new Promise((resolve) => {
      transport.resolve = resolve
    })
  if (transport.reply.ok && transport.values)
    return {
      ok: true,
      response: {
        values: request.fields
          .filter((field) => field.name && field.name in transport.values!)
          .map((field) => ({ fieldId: field.fieldId, value: transport.values![field.name!] })),
      },
    }
  return transport.reply
}
