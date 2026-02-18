import unittest
from enum import Enum
from .cell_states_helper import CellStates, CellState
from math import ceil


class TestCellStates(unittest.TestCase):
    def test_initialization_default_state(self):
        states = CellStates(num_cells=10)
        for i in range(10):
            self.assertEqual(states.get_cell(i), CellState.DEFAULT)

    def test_initialization_with_custom_buffer(self):
        buffer = bytearray([0b01010101, 0b01010101])  # Custom buffer
        states = CellStates(num_cells=8, buffer=buffer)
        for i in range(8):
            self.assertEqual(states.get_cell(i), CellState.LOADING)

    def test_set_cell(self):
        states = CellStates(num_cells=10)
        states.set_cell(CellState.STALE, 5)
        self.assertEqual(states.get_cell(5), CellState.STALE)

    def test_set_cell_out_of_range(self):
        states = CellStates(num_cells=5)
        with self.assertRaises(IndexError):
            states.set_cell(CellState.ERROR, -1)
        with self.assertRaises(IndexError):
            states.set_cell(CellState.ERROR, 5)

    def test_get_cell_out_of_range(self):
        states = CellStates(num_cells=5)
        with self.assertRaises(IndexError):
            states.get_cell(-1)
        with self.assertRaises(IndexError):
            states.get_cell(5)

    def test_append_cell(self):
        states = CellStates(num_cells=3)
        states.append_cell(CellState.LOADING)
        self.assertEqual(states.num_cells, 4)
        self.assertEqual(states.get_cell(3), CellState.LOADING)

    def test_set_multiple_cells(self):
        states = CellStates(num_cells=10)
        positions = [0, 2, 4, 6, 8]
        states.set_cells(positions, CellState.ERROR)
        for pos in positions:
            self.assertEqual(states.get_cell(pos), CellState.ERROR)

    def test_to_bytes(self):
        states = CellStates(num_cells=5)
        expected_length = ceil((5 * 2) / 8)
        self.assertEqual(len(states.to_bytes()), expected_length)

    def test_to_json(self):
        states = CellStates(num_cells=5)
        json_str = states.to_json()
        self.assertIsInstance(json_str, str)

    def test_from_json(self):
        states = CellStates(num_cells=5)
        states.set_cell(CellState.ERROR, 3)
        json_str = states.to_json()
        new_states = CellStates.from_json(json_str)
        self.assertEqual(new_states.num_cells, 5)
        self.assertEqual(new_states.get_cell(3), CellState.ERROR)


if __name__ == "__main__":
    unittest.main()
