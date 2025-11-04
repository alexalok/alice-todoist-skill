export interface AliceRequest {
  meta: {
    locale: string;
    timezone: string;
    client_id?: string;
    interfaces?: Record<string, unknown>;
  };
  session: {
    session_id: string;
    message_id: number;
    user_id: string;
    skill_id?: string;
    user?: {
      user_id?: string;
      access_token?: string;
    };
  };
  version: string;
  request: {
    command: string;
    original_utterance: string;
    type: string;
    payload?: Record<string, unknown>;
    nlu?: {
      tokens: string[];
      entities: Array<Record<string, unknown>>;
      intents?: Record<string, unknown>;
    };
  };
  state?: {
    session?: Record<string, unknown>;
    user?: Record<string, unknown>;
    application?: Record<string, unknown>;
  };
}

export interface AliceResponse {
  version: string;
  session: {
    session_id: string;
    message_id: number;
    user_id: string;
  };
  response: {
    text: string;
    end_session: boolean;
    tts?: string;
    buttons?: Array<{
      title: string;
      payload?: Record<string, unknown>;
      url?: string;
      hide?: boolean;
    }>;
    card?: Record<string, unknown>;
    directives?: {
      account_linking?: Record<string, never>;
    };
  };
  user_state_update?: Record<string, unknown>;
  session_state?: Record<string, unknown>;
  application_state?: Record<string, unknown>;
}


