"""Meet project package."""

import sys

from configurations.importer import ConfigurationLoader

# django-configurations 2.5.1 only implements the legacy load_module() loader API,
# which Python 3.15 no longer calls (gh-97850). Fixed upstream in #386, unreleased.


def _create_module(_self, _spec):
    return None  # default module creation


def _exec_module(self, module):
    sys.modules.pop(module.__name__, None)  # load_module() builds and configures it
    self.load_module(module.__name__)


ConfigurationLoader.create_module = _create_module
ConfigurationLoader.exec_module = _exec_module
