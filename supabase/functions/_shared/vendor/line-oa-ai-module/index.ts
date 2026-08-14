// Vendored from D:\AI-Workspace\projects\modules-hub\modules\line-oa-ai-module on 2026-08-14. Edit only this copy, never modules-hub.
import { LineOaConfig } from './core/types.ts';
import { LineOaWebhookHandler, WebhookHandlerOptions } from './handlers/webhook-handler.ts';

export * from './core/types.ts';
export * from './core/signature.ts';
export * from './core/state-manager.ts';
export * from './adapters/ai-engine.ts';
export * from './adapters/line-client.ts';
export * from './handlers/webhook-handler.ts';

/**
 * Factory function to create a ready-to-use LINE OA AI Module instance
 */
export function createLineOaModule(
  config: LineOaConfig,
  options?: WebhookHandlerOptions
): LineOaWebhookHandler {
  return new LineOaWebhookHandler(config, options);
}
