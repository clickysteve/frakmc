/**
 * Web MIDI output discovery, selection and hot-plug. No input is used (FMC2 had none).
 */
import type { MidiSink } from './router';

export interface OutputInfo {
  id: string;
  name: string;
  manufacturer: string;
  connected: boolean;
}

export type MidiStatus = 'unsupported' | 'pending' | 'denied' | 'ready';

export class WebMidi {
  status: MidiStatus = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator ? 'pending' : 'unsupported';
  error = '';
  private access: MIDIAccess | null = null;
  private readonly changeListeners = new Set<() => void>();

  async init(): Promise<void> {
    if (this.status === 'unsupported') return;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.status = 'ready';
      this.access.onstatechange = () => this.emit();
    } catch (e) {
      this.status = 'denied';
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.emit();
  }

  onChange(f: () => void): () => void {
    this.changeListeners.add(f);
    return () => this.changeListeners.delete(f);
  }

  private emit(): void {
    for (const f of this.changeListeners) f();
  }

  outputs(): OutputInfo[] {
    if (!this.access) return [];
    return [...this.access.outputs.values()].map((o) => ({
      id: o.id, name: o.name ?? o.id, manufacturer: o.manufacturer ?? '', connected: o.state === 'connected',
    }));
  }

  /** A sink for an output, or null if it is not (or no longer) available. */
  sink(id: string): MidiSink | null {
    const out = this.access?.outputs.get(id);
    if (!out || out.state !== 'connected') return null;
    return {
      send(bytes, timestamp) {
        try {
          out.send(bytes, timestamp);
        } catch {
          // device vanished mid-send: the statechange handler will switch away
        }
      },
    };
  }
}
