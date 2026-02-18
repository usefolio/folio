from setuptools import setup, find_packages


def read_requirements(file_path):
    with open(file_path) as f:
        return f.read().splitlines()


setup(
    name="folio-utils-task-processor",
    version="0.1.0",
    packages=find_packages(),
    install_requires=read_requirements("requirements.txt"),
)
