from typing import Callable, Any
from fastapi import BackgroundTasks


class TaskExecutor:
    def execute(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
        raise NotImplementedError("Subclasses should implement this method.")


class FastAPIBackgroundTaskExecutor(TaskExecutor):
    def __init__(self, background_tasks: BackgroundTasks):
        self.background_tasks = background_tasks

    def execute(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
        self.background_tasks.add_task(func, *args, **kwargs)
