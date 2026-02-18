Run with:

export PYTHONPATH=$(pwd)/../../../:$PYTHONPATH && pytest test_data_lakehouse.py -vv

for coverage:
pytest --cov=data_lakehouse test_data_lakehouse.py
