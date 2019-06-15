#!/usr/bin/env bash

echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
docker push r2web/concerto-platform:$TRAVIS_BRANCH
if [[ "$TRAVIS_BRANCH" = "master" ]]; then docker push r2web/concerto-platform:latest; fi