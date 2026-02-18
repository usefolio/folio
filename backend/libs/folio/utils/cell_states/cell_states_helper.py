from enum import Enum
from math import ceil
from typing import List
import base64
import json


class CellState(Enum):
    ERROR = 0b00
    LOADING = 0b01
    STALE = 0b10
    DEFAULT = 0b11


class CellStates:
    def __init__(self, num_cells: int, buffer: bytearray = None):
        """
        Initialize the CellStates object.

        :param num_cells: Initial number of cells
        :param buffer: Optional existing buffer (must match num_cells)
        """
        self.num_cells = num_cells
        if buffer is not None:
            # Assuming the provided buffer corresponds exactly to num_cells' worth of data
            self.buffer = buffer
        else:
            self._initialize_state(num_cells, CellState.DEFAULT)

    def _initialize_state(self, num_cells: int, state: CellState):
        """
        Initialize the internal buffer, setting all cells to the specified state.

        :param num_cells: The number of cells to initialize.
        :param state: The desired state for all cells (an instance of CellState).
        """
        state_bits = state.value
        byte_pattern = (
            state_bits | (state_bits << 2) | (state_bits << 4) | (state_bits << 6)
        ) & 0xFF

        buffer_size = ceil((num_cells * 2) / 8)
        self.buffer = bytearray(buffer_size)

        for i in range(buffer_size):
            self.buffer[i] = byte_pattern

    def set_cell(self, state: CellState, position: int):
        """
        Set the cell at the given position to the specified state.
        :param state: The desired state for the cell (an instance of CellState).
        :param position: Zero-based position of the cell.
        """
        if position < 0 or position >= self.num_cells:
            raise IndexError("Cell position out of range")

        state_bits = state.value
        bit_offset = position * 2
        byte_index = bit_offset // 8
        bit_in_byte = bit_offset % 8

        mask = ~(0b11 << bit_in_byte) & 0xFF
        self.buffer[byte_index] &= mask
        self.buffer[byte_index] |= state_bits << bit_in_byte

    def get_cell(self, position: int) -> CellState:
        """
        Get the state of the cell at the given position.

        :param position: Zero-based position of the cell.
        :return: The state of the cell (an instance of CellState).
        """
        if position < 0 or position >= self.num_cells:
            raise IndexError("Cell position out of range")

        bit_offset = position * 2
        byte_index = bit_offset // 8
        bit_in_byte = bit_offset % 8

        cell_bits = (self.buffer[byte_index] >> bit_in_byte) & 0b11
        return CellState(cell_bits)

    def append_cell(self, state: CellState):
        """
        Append a new cell with the given state to the end of the existing buffer.
        Resizes the buffer if necessary.

        :param state: The state of the new cell (an instance of CellState).
        """
        state_bits = state.value
        bit_offset = self.num_cells * 2
        byte_index = bit_offset // 8
        bit_in_byte = bit_offset % 8

        if byte_index >= len(self.buffer):
            self.buffer += b"\x00"

        mask = ~(0b11 << bit_in_byte) & 0xFF
        self.buffer[byte_index] &= mask
        self.buffer[byte_index] |= state_bits << bit_in_byte

        self.num_cells += 1

    def set_cells(self, cells_positions: List[int], state: CellState):
        """
        Set the specified state for multiple cell positions.

        :param cells_positions: A list of zero-based cell positions (integers).
        :param state: The desired state for the cells (an instance of CellState).
        """
        for position in cells_positions:
            self.set_cell(state, position)

    def to_bytes(self) -> bytes:
        """
        Return a bytes object representing the used portion of the buffer.

        :return: A bytes object containing the packed cell states.
        """
        used_bytes = ceil((self.num_cells * 2) / 8)
        return bytes(self.buffer[:used_bytes])

    def to_json(self) -> str:
        """
        Serialize the object to a JSON-compatible string.
        """
        return json.dumps(
            {
                "num_cells": self.num_cells,
                "buffer": base64.b64encode(self.buffer).decode("utf-8"),
            }
        )

    @classmethod
    def from_json(cls, json_str: str):
        """
        Deserialize the object from a JSON-compatible string.
        """
        data = json.loads(json_str)
        return cls(data["num_cells"], bytearray(base64.b64decode(data["buffer"])))
