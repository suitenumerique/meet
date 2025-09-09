#!/bin/bash

# Start the Django backend server
gunicorn -b :8000 meet.wsgi:application --log-file - &

# Start the Nginx server
bin/run &

# if the current shell is killed, also terminate all its children     
trap "pkill SIGTERM -P $$" SIGTERM                            

# wait for a single child to finish,                               
wait -n                                                  
# then kill all the other tasks                          
pkill -P $$
