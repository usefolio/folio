#!/bin/bash

# Function to print usage information
function print_usage() {
    echo "Usage: $0 [component]"
    echo "Components: data_lakehouse, queue_monitor, cell_states, dataset_processor, usage_cop, all"
    echo "Example: $0 data_lakehouse"
}

# Ensure the test virtual environment exists
if [ ! -d "test-venv" ]; then
    echo "Creating test virtual environment..."
    python3 -m venv test-venv
fi

# Activate the virtual environment
source test-venv/bin/activate

# Always upgrade pip to avoid version conflicts
python -m pip install --upgrade pip > /dev/null

# Set up common environment
export PYTHONPATH=./libs:./libs/folio/utils/:$PYTHONPATH

# Check if component argument is provided
if [ $# -eq 0 ]; then
    print_usage
    exit 1
fi

component=$1

# Map components to test files for cases where the naming doesn't follow
# the standard `test_<component>.py` pattern.
declare -A TEST_FILES
TEST_FILES["usage_cop"]="test_aggregation.py"

function get_test_file() {
    local comp=$1
    echo "${TEST_FILES[$comp]:-test_${comp}.py}"
}

# Create temporary coverage configuration file to exclude setup files
cat > .coveragerc << EOL
[run]
omit = 
    */setup.py
    */__init__.py
    */conftest.py
    */test_*.py
EOL

# Function to install test requirements for a specific component
function install_requirements() {
    local component=$1
    
    # Install test requirements if they exist
    if [ -f "libs/folio/utils/$component/requirements.test.txt" ]; then
        echo "Installing test requirements for $component..."
        (cd "libs/folio/utils/$component" && pip install -r requirements.test.txt)
    fi
}

# Function to run tests for a specific component
function run_single_test() {
    local component=$1

    echo "===== Testing $component ====="
    
    # Install test requirements
    install_requirements "$component"
    
    # Run the pytest command with coverage
    local test_file
    test_file=$(get_test_file "$component")
    pytest "libs/folio/utils/$component/$test_file" -vv --cov="libs/folio/utils/$component"
    
    echo "===== Completed testing $component ====="
    echo ""
}

# Function to run all tests in a single pytest command
function run_combined_tests() {
    local components=("$@")
    local test_paths=()
    local cov_paths=()
    
    echo "===== Testing all components in a single pytest run ====="
    
    # Install all requirements first
    for comp in "${components[@]}"; do
        install_requirements "$comp"
    done
    
    # Build the test paths and coverage paths
    for comp in "${components[@]}"; do
        local test_file
        test_file=$(get_test_file "$comp")
        test_paths+=("libs/folio/utils/$comp/$test_file")
        cov_paths+=("--cov=libs/folio/utils/$comp")
    done
    
    # Run the combined pytest command
    pytest "${test_paths[@]}" -vv "${cov_paths[@]}" --cov-report=term
    
    echo "===== Completed testing all components ====="
    echo ""
}

# Run tests based on the component specified
case $component in
    "data_lakehouse")
        run_single_test "data_lakehouse"
        ;;
    "queue_monitor")
        run_single_test "queue_monitor"
        ;;
    "cell_states")
        run_single_test "cell_states"
        ;;
    "dataset_processor")
        run_single_test "dataset_processor"
        ;;
    "usage_cop"|"billing_aggregator")
        run_single_test "usage_cop"
        ;;
    "all")
        run_combined_tests "data_lakehouse" "queue_monitor" "cell_states" "dataset_processor" "usage_cop"
        ;;
    *)
        echo "Error: Unknown component '$component'"
        print_usage
        exit 1
        ;;
esac

# Clean up temporary coverage configuration
rm -f .coveragerc

echo "All tests completed!"
