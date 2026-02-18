
# Its almost like this is the piece that will be reading off a queu and then executing
# the jobs.
# Gotta seralize the jobs for the column. 

# Check to see what happens if promo compilation fails
# Check to see if we send back errors to the client
# Check to see what happens if the queue partially succeeds
# Retries should be handled somewhere here..especially 500s from openai
# This is where we should handle batching up the tasks (for example if there are more than 5000)

class JobExecutor:
    
    def __init__():
        return