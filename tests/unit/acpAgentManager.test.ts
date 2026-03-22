import { beforeEach, describe, expect, it, vi } from 'vitest';

const responseStreamEmitMock = vi.fn();
const showNotificationMock = vi.fn();
const addMessageMock = vi.fn();
const addOrUpdateMessageMock = vi.fn();
const setProcessingMock = vi.fn();
const channelEventBusEmitMock = vi.fn();
const processConfigGetMock = vi.fn();
const dbGetConversationMock = vi.fn();
const dbUpdateConversationMock = vi.fn();
const agentSendMessageMock = vi.fn(async () => ({ success: true }));
let capturedAgentConfig: any = null;

vi.mock('@process/worker/fork/ForkTask', () => ({
  ForkTask: class {
    protected data: unknown;

    constructor(_path: string, data: unknown) {
      this.data = data;
    }

    kill(): void {}
    protected init(): void {}
    protected postMessagePromise(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

vi.mock('@process/agent/acp', () => ({
  AcpAgent: class {
    isConnected = true;
    hasActiveSession = true;

    constructor(config: unknown) {
      capturedAgentConfig = config;
    }

    start(): Promise<this> {
      return Promise.resolve(this);
    }

    sendMessage(...args: unknown[]): Promise<{ success: boolean }> {
      return agentSendMessageMock(...args);
    }

    stop(): Promise<void> {
      capturedAgentConfig?.onStreamEvent({
        type: 'agent_status',
        conversation_id: 'conv-1',
        msg_id: 'status-stop',
        data: { status: 'disconnected' },
      });
      capturedAgentConfig?.onStreamEvent({
        type: 'finish',
        conversation_id: 'conv-1',
        msg_id: 'finish-stop',
        data: null,
      });
      return Promise.resolve();
    }

    getModelInfo(): null {
      return null;
    }

    confirmMessage(): void {}
    setMode(): Promise<{ success: boolean }> {
      return Promise.resolve({ success: true });
    }

    setModelByConfigOption(): Promise<null> {
      return Promise.resolve(null);
    }

    getConfigOptions(): [] {
      return [];
    }
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      responseStream: {
        emit: (...args: unknown[]) => responseStreamEmitMock(...args),
      },
    },
    conversation: {
      responseStream: {
        emit: vi.fn(),
      },
      confirmation: {
        add: { emit: vi.fn() },
        update: { emit: vi.fn() },
        remove: { emit: vi.fn() },
      },
    },
  },
}));

vi.mock('@process/bridge/notificationBridge', () => ({
  showNotification: (...args: unknown[]) => showNotificationMock(...args),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: (...args: unknown[]) => processConfigGetMock(...args),
    set: vi.fn(),
  },
}));

vi.mock('@process/utils/message', () => ({
  addMessage: (...args: unknown[]) => addMessageMock(...args),
  addOrUpdateMessage: (...args: unknown[]) => addOrUpdateMessageMock(...args),
  nextTickToLocalFinish: (callback: () => void) => callback(),
}));

vi.mock('@process/services/database', () => ({
  getDatabase: () => ({
    getConversation: (...args: unknown[]) => dbGetConversationMock(...args),
    updateConversation: (...args: unknown[]) => dbUpdateConversationMock(...args),
  }),
}));

vi.mock('@process/services/i18n', () => ({
  default: {
    t: (key: string, params?: { title?: string }) => {
      switch (key) {
        case 'acp.notification.responseComplete':
          return `${params?.title} - Response complete`;
        case 'acp.notification.responseFailed':
          return `${params?.title} - Response failed`;
        case 'acp.notification.openConversation':
          return 'Click to open the conversation';
        case 'acp.notification.reviewConversation':
          return 'Click to review the conversation';
        case 'acp.notification.defaultConversationTitle':
          return 'Conversation';
        default:
          return key;
      }
    },
  },
  i18nReady: Promise.resolve(),
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: {
    emitAgentMessage: (...args: unknown[]) => channelEventBusEmitMock(...args),
  },
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: {
    setProcessing: (...args: unknown[]) => setProcessingMock(...args),
  },
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: () => ({
      getAcpAdapters: () => [],
    }),
  },
}));

vi.mock('@process/utils/previewUtils', () => ({
  handlePreviewOpenEvent: () => false,
}));

vi.mock('@/common/chat/chatLib', () => ({
  transformMessage: (message: { type: string; conversation_id: string; msg_id: string; data: unknown }) => {
    switch (message.type) {
      case 'content':
        return {
          type: 'text',
          conversation_id: message.conversation_id,
          msg_id: message.msg_id,
          content: { content: String(message.data ?? '') },
        };
      case 'error':
        return {
          type: 'tips',
          conversation_id: message.conversation_id,
          msg_id: message.msg_id,
          content: { content: String(message.data ?? ''), type: 'error' },
        };
      case 'agent_status':
        return {
          type: 'agent_status',
          conversation_id: message.conversation_id,
          msg_id: message.msg_id,
          content: message.data,
        };
      case 'plan':
        return {
          type: 'plan',
          conversation_id: message.conversation_id,
          msg_id: message.msg_id,
          content: message.data,
        };
      default:
        return null;
    }
  },
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));

import AcpAgentManager from '../../src/process/task/AcpAgentManager';

describe('AcpAgentManager notifications', () => {
  beforeEach(() => {
    capturedAgentConfig = null;
    vi.clearAllMocks();

    processConfigGetMock.mockImplementation(async (key: string) => {
      switch (key) {
        case 'acp.config':
          return {};
        case 'system.notificationEnabled':
          return true;
        case 'system.acpNotificationEnabled':
          return true;
        default:
          return undefined;
      }
    });

    dbGetConversationMock.mockReturnValue({
      success: true,
      data: {
        id: 'conv-1',
        name: 'ACP Chat',
        type: 'acp',
        extra: {
          backend: 'claude',
        },
      },
    });
  });

  it('shows a system notification when an ACP turn completes successfully', async () => {
    const manager = new AcpAgentManager({
      backend: 'claude',
      conversation_id: 'conv-1',
      workspace: '/tmp/workspace',
    });

    await manager.sendMessage({ content: 'hello', msg_id: 'user-1' });

    capturedAgentConfig.onStreamEvent({
      type: 'content',
      conversation_id: 'conv-1',
      msg_id: 'assistant-1',
      data: 'done',
    });

    await capturedAgentConfig.onSignalEvent({
      type: 'finish',
      conversation_id: 'conv-1',
      msg_id: 'finish-1',
      data: null,
    });

    expect(showNotificationMock).toHaveBeenCalledWith({
      title: 'ACP Chat - Response complete',
      body: 'Click to open the conversation',
      conversationId: 'conv-1',
    });
  });

  it('shows a failure notification when an ACP turn ends with an error', async () => {
    const manager = new AcpAgentManager({
      backend: 'claude',
      conversation_id: 'conv-1',
      workspace: '/tmp/workspace',
    });

    await manager.sendMessage({ content: 'hello', msg_id: 'user-1' });

    capturedAgentConfig.onStreamEvent({
      type: 'error',
      conversation_id: 'conv-1',
      msg_id: 'assistant-error',
      data: 'boom',
    });

    await capturedAgentConfig.onSignalEvent({
      type: 'finish',
      conversation_id: 'conv-1',
      msg_id: 'finish-1',
      data: null,
    });

    expect(showNotificationMock).toHaveBeenCalledWith({
      title: 'ACP Chat - Response failed',
      body: 'Click to review the conversation',
      conversationId: 'conv-1',
    });
  });

  it('does not show a notification when ACP notifications are disabled', async () => {
    processConfigGetMock.mockImplementation(async (key: string) => {
      if (key === 'system.acpNotificationEnabled') {
        return false;
      }
      if (key === 'acp.config') {
        return {};
      }
      return true;
    });

    const manager = new AcpAgentManager({
      backend: 'claude',
      conversation_id: 'conv-1',
      workspace: '/tmp/workspace',
    });

    await manager.sendMessage({ content: 'hello', msg_id: 'user-1' });

    capturedAgentConfig.onStreamEvent({
      type: 'content',
      conversation_id: 'conv-1',
      msg_id: 'assistant-1',
      data: 'done',
    });

    await capturedAgentConfig.onSignalEvent({
      type: 'finish',
      conversation_id: 'conv-1',
      msg_id: 'finish-1',
      data: null,
    });

    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it('does not show a notification when the turn is stopped manually', async () => {
    const manager = new AcpAgentManager({
      backend: 'claude',
      conversation_id: 'conv-1',
      workspace: '/tmp/workspace',
    });

    await manager.sendMessage({ content: 'hello', msg_id: 'user-1' });

    capturedAgentConfig.onStreamEvent({
      type: 'content',
      conversation_id: 'conv-1',
      msg_id: 'assistant-1',
      data: 'partial',
    });

    await manager.stop();

    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it('does not show a notification for disconnect cleanup', async () => {
    const manager = new AcpAgentManager({
      backend: 'claude',
      conversation_id: 'conv-1',
      workspace: '/tmp/workspace',
    });

    await manager.sendMessage({ content: 'hello', msg_id: 'user-1' });

    capturedAgentConfig.onStreamEvent({
      type: 'agent_status',
      conversation_id: 'conv-1',
      msg_id: 'status-1',
      data: { status: 'disconnected' },
    });
    capturedAgentConfig.onStreamEvent({
      type: 'error',
      conversation_id: 'conv-1',
      msg_id: 'assistant-error',
      data: 'disconnected',
    });

    await capturedAgentConfig.onSignalEvent({
      type: 'finish',
      conversation_id: 'conv-1',
      msg_id: 'finish-1',
      data: null,
    });

    expect(showNotificationMock).not.toHaveBeenCalled();
  });
});
