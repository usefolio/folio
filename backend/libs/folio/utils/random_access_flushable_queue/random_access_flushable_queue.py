class RandomAccessFlushableQueue:
    def __init__(self):
        self.items = {}  # Store items by ID
        self.unflushed_ids = set()  # Track IDs of unflushed items

    def add_item(self, id: str, item: object, flushed: bool = False):
        self.items[id] = {"item": item, "flushed": flushed}
        if not flushed:
            self.unflushed_ids.add(id)

    def get_total_items(self) -> int:
        return len(self.items)

    def get_total_items_unflushed(self) -> int:
        return len(self.unflushed_ids)

    def get_items_unflushed(self) -> list[object]:
        return [self.items[id]["item"] for id in self.unflushed_ids]

    def set_items_flushed(self, ids: list[str]):
        for id in ids:
            if id in self.items and not self.items[id]["flushed"]:
                self.items[id]["flushed"] = True
                self.unflushed_ids.discard(id)

    def flush_all_unflushed(self):
        to_flush = list(self.unflushed_ids)
        self.set_items_flushed(to_flush)
        flushed_items = [self.items[id]["item"] for id in to_flush]
        return (to_flush, flushed_items)  # Return the flushed items

    def get_items(self) -> list[object]:
        return [entry["item"] for entry in self.items.values()]
