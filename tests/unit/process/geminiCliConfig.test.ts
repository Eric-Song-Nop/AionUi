import { beforeEach, describe, expect, it, vi } from 'vitest';

let capturedConfigParams: Record<string, unknown> | null = null;

vi.mock('@office-ai/aioncli-core', () => {
  class MockConfig {
    constructor(params: Record<string, unknown>) {
      capturedConfigParams = params;
    }

    setFallbackModelHandler = vi.fn();
  }

  class MockFileDiscoveryService {
    constructor(_workspace: string) {}
  }

  class MockSimpleExtensionLoader {
    constructor(_extensions: unknown[]) {}
  }

  return {
    ApprovalMode: {
      DEFAULT: 'DEFAULT',
      YOLO: 'YOLO',
    },
    Config: MockConfig,
    DEFAULT_GEMINI_EMBEDDING_MODEL: 'mock-embedding-model',
    DEFAULT_GEMINI_MODEL: 'mock-default-model',
    DEFAULT_MEMORY_FILE_FILTERING_OPTIONS: {},
    FileDiscoveryService: MockFileDiscoveryService,
    PREVIEW_GEMINI_MODEL_AUTO: 'mock-auto-model',
    SimpleExtensionLoader: MockSimpleExtensionLoader,
    getCurrentGeminiMdFilename: vi.fn(() => 'GEMINI.md'),
    loadServerHierarchicalMemory: vi.fn(async () => ({
      memoryContent: '',
      fileCount: 0,
    })),
    loadSkillsFromDir: vi.fn(async () => []),
    setGeminiMdFilename: vi.fn(),
  };
});

vi.mock('../../../src/process/agent/gemini/cli/extension', () => ({
  annotateActiveExtensions: (
    extensions: Array<Record<string, unknown>>
  ): Array<Record<string, unknown> & { isActive: true }> =>
    extensions.map((extension) => ({ ...extension, isActive: true })),
}));

vi.mock('../../../src/process/agent/gemini/index', () => ({
  getCurrentGeminiAgent: vi.fn(() => undefined),
}));

import type { Settings } from '../../../src/process/agent/gemini/cli/settings';
import type { ConversationToolConfig } from '../../../src/process/agent/gemini/cli/tools/conversation-tool-config';
import { loadCliConfig } from '../../../src/process/agent/gemini/cli/config';

function createConversationToolConfig(): ConversationToolConfig {
  return {
    getConfig: () => ({
      useGeminiWebSearch: false,
      useAionuiWebFetch: false,
      geminiModel: null,
      excludeTools: [],
    }),
  } as unknown as ConversationToolConfig;
}

describe('loadCliConfig', () => {
  beforeEach(() => {
    capturedConfigParams = null;
    vi.clearAllMocks();
  });

  it('forces child_process shell execution and disables interactive shell mode', async () => {
    const settings: Settings = {
      excludeTools: [],
      mcpServers: {},
    };

    await loadCliConfig({
      workspace: '/tmp/aionui-workspace',
      settings,
      extensions: [],
      sessionId: 'session-1',
      conversationToolConfig: createConversationToolConfig(),
    });

    expect(capturedConfigParams).toMatchObject({
      interactive: true,
      ptyInfo: 'child_process',
      enableInteractiveShell: false,
    });
  });
});
