/**
 * Engine Domain Entity
 * Represents a TTS engine configuration and status
 */

import type {
  EngineType,
  EngineDefinition,
  EngineStatus,
  EngineCredentials,
  ENGINE_DEFINITIONS,
} from '../../types/engine.types.js';

export interface EngineProps {
  id: EngineType;
  enabled: boolean;
  credentials?: EngineCredentials;
  defaultVoice?: string;
  lastChecked?: Date;
  voiceCount?: number;
  lastError?: string;
}

export class Engine {
  private readonly props: EngineProps;
  private readonly definition: EngineDefinition;

  private constructor(props: EngineProps, definition: EngineDefinition) {
    this.props = props;
    this.definition = definition;
  }

  // Getters
  get id(): EngineType {
    return this.props.id;
  }
  get name(): string {
    return this.definition.name;
  }
  get enabled(): boolean {
    return this.props.enabled;
  }
  get category(): 'free' | 'paid' {
    return this.definition.category;
  }
  get requiresCredentials(): boolean {
    return this.definition.requiresCredentials;
  }
  get credentials(): EngineCredentials | undefined {
    return this.props.credentials;
  }
  get defaultVoice(): string | undefined {
    return this.props.defaultVoice;
  }
  get lastChecked(): Date | undefined {
    return this.props.lastChecked;
  }
  get voiceCount(): number | undefined {
    return this.props.voiceCount;
  }
  get lastError(): string | undefined {
    return this.props.lastError;
  }
  get supportsStreaming(): boolean {
    return this.definition.supportsStreaming;
  }
  get supportsSSML(): boolean {
    return this.definition.supportsSSML;
  }
  get supportedFormats(): string[] {
    return this.definition.supportedFormats;
  }
  get credentialFields() {
    return this.definition.credentialFields;
  }

  // Business logic
  hasCredentials(): boolean {
    if (!this.definition.requiresCredentials) return true;
    if (!this.props.credentials) return false;

    // Check all required credential fields are present and non-empty
    return this.definition.credentialFields
      .filter((f) => f.required)
      .every((field) => {
        const value = this.props.credentials?.[field.envVar];
        return value !== undefined && value !== '';
      });
  }

  isAvailable(): boolean {
    return this.props.enabled && this.hasCredentials();
  }

  getStatus(): EngineStatus {
    return {
      engine: this.props.id,
      available: this.isAvailable(),
      hasCredentials: this.hasCredentials(),
      voiceCount: this.props.voiceCount ?? 0,
      message: this.getStatusMessage(),
      error: this.props.lastError,
      lastChecked: this.props.lastChecked ?? new Date(),
    };
  }

  private getStatusMessage(): string {
    if (!this.props.enabled) {
      return 'Engine is disabled';
    }
    if (!this.hasCredentials()) {
      return 'Missing required credentials';
    }
    if (this.props.lastError) {
      return `Error: ${this.props.lastError}`;
    }
    return `Available (${this.props.voiceCount ?? 0} voices)`;
  }

  getMissingCredentials(): string[] {
    if (!this.definition.requiresCredentials) return [];

    return this.definition.credentialFields
      .filter((f) => f.required)
      .filter((field) => {
        const value = this.props.credentials?.[field.envVar];
        return value === undefined || value === '';
      })
      .map((f) => f.envVar);
  }

  supportsFormat(format: string): boolean {
    return this.definition.supportedFormats.includes(format.toLowerCase());
  }

  // Factory method
  static create(
    id: EngineType,
    definitions: typeof ENGINE_DEFINITIONS,
    props: Partial<Omit<EngineProps, 'id'>> = {}
  ): Engine {
    const definition = definitions[id];
    if (!definition) {
      throw new Error(`Unknown engine: ${id}`);
    }

    return new Engine(
      {
        id,
        enabled: props.enabled ?? true,
        credentials: props.credentials,
        defaultVoice: props.defaultVoice,
        lastChecked: props.lastChecked,
        voiceCount: props.voiceCount,
        lastError: props.lastError,
      },
      definition
    );
  }

  // Mutation methods (return new instance)
  withCredentials(credentials: EngineCredentials): Engine {
    return new Engine({ ...this.props, credentials }, this.definition);
  }

  withEnabled(enabled: boolean): Engine {
    return new Engine({ ...this.props, enabled }, this.definition);
  }

  withVoiceCount(voiceCount: number): Engine {
    return new Engine(
      { ...this.props, voiceCount, lastChecked: new Date(), lastError: undefined },
      this.definition
    );
  }

  withError(error: string): Engine {
    return new Engine(
      { ...this.props, lastError: error, lastChecked: new Date() },
      this.definition
    );
  }

  // Serialization
  toData(): EngineProps {
    return { ...this.props };
  }

  toJSON() {
    return {
      id: this.props.id,
      name: this.definition.name,
      enabled: this.props.enabled,
      category: this.definition.category,
      requiresCredentials: this.definition.requiresCredentials,
      hasCredentials: this.hasCredentials(),
      available: this.isAvailable(),
      voiceCount: this.props.voiceCount ?? 0,
      supportsStreaming: this.definition.supportsStreaming,
      supportsSSML: this.definition.supportsSSML,
      supportedFormats: this.definition.supportedFormats,
    };
  }
}

/**
 * Engine Registry - manages all available engines
 */
export class EngineRegistry {
  private readonly engines: Map<EngineType, Engine>;
  private readonly definitions: typeof ENGINE_DEFINITIONS;

  constructor(definitions: typeof ENGINE_DEFINITIONS) {
    this.definitions = definitions;
    this.engines = new Map();

    // Initialize all engines as disabled by default
    for (const id of Object.keys(definitions) as EngineType[]) {
      this.engines.set(id, Engine.create(id, definitions, { enabled: false }));
    }
  }

  get(id: EngineType): Engine | undefined {
    return this.engines.get(id);
  }

  set(engine: Engine): void {
    this.engines.set(engine.id, engine);
  }

  getAll(): Engine[] {
    return Array.from(this.engines.values());
  }

  getAvailable(): Engine[] {
    return this.getAll().filter((e) => e.isAvailable());
  }

  getEnabled(): Engine[] {
    return this.getAll().filter((e) => e.enabled);
  }

  getAllStatuses(): Record<EngineType, EngineStatus> {
    const statuses: Partial<Record<EngineType, EngineStatus>> = {};
    for (const engine of this.getAll()) {
      statuses[engine.id] = engine.getStatus();
    }
    return statuses as Record<EngineType, EngineStatus>;
  }

  enableEngine(id: EngineType, credentials?: EngineCredentials): void {
    const engine = this.get(id);
    if (!engine) {
      throw new Error(`Unknown engine: ${id}`);
    }

    let updated = engine.withEnabled(true);
    if (credentials) {
      updated = updated.withCredentials(credentials);
    }
    this.set(updated);
  }

  disableEngine(id: EngineType): void {
    const engine = this.get(id);
    if (engine) {
      this.set(engine.withEnabled(false));
    }
  }
}
