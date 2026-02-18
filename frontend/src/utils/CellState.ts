import { showErrorNotification } from "../components/notification/NotificationHandler";
import i18next from "i18next";

export enum CellState {
  Error = 0b00,
  Loading = 0b01,
  Stale = 0b10,
  Default = 0b11,
}

export class CellStates {
  private buffer: Uint8Array;
  private numCells: number;

  constructor(numCells: number);
  constructor(arrayBuffer: ArrayBuffer, numCells: number);
  constructor(param: number | ArrayBuffer, numCells?: number) {
    try {
      if (typeof param === "number") {
        this.numCells = param;
        const bufferSize = Math.ceil((this.numCells * 2) / 8);
        this.buffer = new Uint8Array(bufferSize);
        this.initializeState();
      } else if (param instanceof ArrayBuffer && typeof numCells === "number") {
        this.buffer = new Uint8Array(param);
        this.numCells = numCells;
      } else {
        throw new Error(
          i18next.t("utils.cell_states.initialization_error", {
            parameter: param instanceof ArrayBuffer,
          }),
        );
      }
    } catch (error) {
      showErrorNotification(
        i18next.t("utils.cell_states.error_title"),
        i18next.t("utils.cell_states.initialization_error"),
      );
      throw error;
    }
  }

  initializeState(arrayBuffer?: ArrayBuffer, numCells?: number) {
    try {
      if (arrayBuffer && typeof numCells === "number") {
        this.buffer = new Uint8Array(arrayBuffer);
        this.numCells = numCells;
      } else {
        // Initialize all cells to the default state (11)
        this.buffer.fill(0xff); // 0xFF sets all bits to 1
      }
    } catch (error) {
      showErrorNotification(
        i18next.t("utils.cell_states.error_title"),
        i18next.t("utils.cell_states.initialization_error"),
      );
      throw error;
    }
  }

  static fromJSON(jsonString: string): CellStates {
    try {
      const data = JSON.parse(jsonString);

      // Decode the base64-encoded buffer
      const buffer = CellStates.base64ToUint8Array(data.buffer).buffer;

      return new CellStates(buffer, data.num_cells);
    } catch (error) {
      showErrorNotification(
        i18next.t("utils.cell_states.error_title"),
        i18next.t("utils.cell_states.parsing_error"),
      );
      throw error;
    }
  }
  // Helper function to decode base64 into a Uint8Array
  private static base64ToUint8Array(base64: string): Uint8Array {
    try {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } catch (error) {
      showErrorNotification(
        i18next.t("utils.cell_states.error_title"),
        i18next.t("utils.cell_states.decoding_error"),
      );
      throw error;
    }
  }

  hasAnyLoadingState(): boolean {
    try {
      // Create a mask that matches any byte containing a loading state
      // 0b01010101 = 0x55 (checks if any of the 4 cells in a byte is in loading state)
      // BUGFIX
      // The previous implementation with only mask 0x55 (0b01010101) checked if the least significant bit of each 2-bit pair is 1.
      // But this incorrectly matched both Loading (0b01) and Default (0b11) states, since both have their LSB set to 1.
      // Loading state is 0b01, which means Least significant and most Significant bit have to be 1
      const lsbMask = 0x55;
      const msbMask = 0xaa;

      // Check each byte in the buffer
      for (let i = 0; i < this.buffer.length; i++) {
        const byte = this.buffer[i];
        const hasLSB = byte & lsbMask;
        const hasMSB = byte & msbMask;
        // Loading exists if: LSB is set AND MSB is not set in those same positions
        if (hasLSB !== 0 && (hasLSB & (hasMSB >> 1)) !== hasLSB) {
          return true;
        }
      }
      return false;
    } catch (error) {
      showErrorNotification(
        i18next.t("utils.cell_states.error_title"),
        i18next.t("utils.cell_states.checking_loading_state_error"),
      );
      throw error;
    }
  }

  getStateAtPosition(pos: number): CellState {
    try {
      if (pos < 0 || pos >= this.numCells) {
        // throw new RangeError(t("utils.cell_states.out_of_bounds"));
      }
      const bitOffset = pos * 2;
      const byteIndex = Math.floor(bitOffset / 8);
      const bitInByte = bitOffset % 8;
      const byte = this.buffer[byteIndex];
      const bits = (byte >> bitInByte) & 0b11;
      return bits as CellState;
    } catch (error) {
      showErrorNotification(
        i18next.t("utils.cell_states.error_title"),
        i18next.t("utils.cell_states.retrieving_state_error"),
      );
      throw error;
    }
  }

  setStateAtPosition(pos: number, state: CellState) {
    try {
      if (pos < 0 || pos >= this.numCells) {
        throw new RangeError("Position out of bounds");
      }

      const bitOffset = pos * 2;
      const byteIndex = Math.floor(bitOffset / 8);
      const bitInByte = bitOffset % 8;

      // Clear the existing 2 bits
      const mask = ~(0b11 << bitInByte) & 0xff;
      this.buffer[byteIndex] &= mask;

      // Set the new state
      this.buffer[byteIndex] |= state << bitInByte;
    } catch (error) {
      showErrorNotification(
        i18next.t("utils.cell_states.error_title"),
        i18next.t("utils.cell_states.updating_state_error"),
      );
      throw error;
    }
  }

  appendState(state: CellState) {
    try {
      const bitOffset = this.numCells * 2;
      const byteIndex = Math.floor(bitOffset / 8);
      const bitInByte = bitOffset % 8;

      // Resize buffer if necessary
      if (byteIndex >= this.buffer.length) {
        const newBuffer = new Uint8Array(this.buffer.length + 1);
        newBuffer.set(this.buffer);
        this.buffer = newBuffer;
      }

      // Clear the bits at the new position (optional since bits are uninitialized)
      const mask = ~(0b11 << bitInByte) & 0xff;
      this.buffer[byteIndex] &= mask;

      // Set the new state
      this.buffer[byteIndex] |= state << bitInByte;

      // Increment the cell count
      this.numCells += 1;
    } catch (error) {
      showErrorNotification(
        i18next.t("utils.cell_states.error_title"),
        i18next.t("utils.cell_states.appending_state_error"),
      );
      throw error;
    }
  }
  // Method to get the underlying ArrayBuffer
  toArrayBuffer(): ArrayBuffer {
    try {
      // Return a copy of the buffer up to the used portion
      const usedBytes = Math.ceil((this.numCells * 2) / 8);
      return this.buffer.slice(0, usedBytes).buffer;
    } catch (error) {
      showErrorNotification(
        i18next.t("utils.cell_states.error_title"),
        i18next.t("utils.cell_states.conversion_error"),
      );
      throw error;
    }
  }
  // Optional helper methods
  setErrorAtPosition(pos: number) {
    this.setStateAtPosition(pos, CellState.Error);
  }

  setLoadingAtPosition(pos: number) {
    this.setStateAtPosition(pos, CellState.Loading);
  }

  setStaleAtPosition(pos: number) {
    this.setStateAtPosition(pos, CellState.Stale);
  }

  setDefaultAtPosition(pos: number) {
    this.setStateAtPosition(pos, CellState.Default);
  }

  getStateNameAtPosition(pos: number): string {
    const state = this.getStateAtPosition(pos);
    switch (state) {
      case CellState.Error:
        return "error";
      case CellState.Loading:
        return "loading";
      case CellState.Stale:
        return "stale";
      case CellState.Default:
        return "default";
      default:
        return "unknown";
    }
  }

  setAllToState(state: CellState) {
    try {
      for (let i = 0; i < this.numCells; i++) {
        this.setStateAtPosition(i, state);
      }
    } catch (error) {
      showErrorNotification(
        i18next.t("utils.cell_states.error_title"),
        i18next.t("utils.cell_states.updating_all_states_error"),
      );
      throw error;
    }
  }
}
