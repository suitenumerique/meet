# ruff: noqa: S311
"""
Core application factories
"""

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.utils.text import slugify

import factory.fuzzy
from faker import Faker

from core import models

fake = Faker()


class UserFactory(factory.django.DjangoModelFactory):
    """A factory to random users for testing purposes."""

    class Meta:
        model = models.User

    sub = factory.Sequence(lambda n: f"user{n!s}")
    email = factory.Faker("email")
    full_name = factory.Faker("name")
    short_name = factory.Faker("first_name")
    language = factory.fuzzy.FuzzyChoice([lang[0] for lang in settings.LANGUAGES])
    password = make_password("password")


class ResourceFactory(factory.django.DjangoModelFactory):
    """Create fake resources for testing."""

    class Meta:
        model = models.Resource
        skip_postgeneration_save = True

    @factory.post_generation
    def users(self, create, extracted, **kwargs):
        """Add users to resource from a given list of users."""
        if create and extracted:
            for item in extracted:
                if isinstance(item, models.User):
                    UserResourceAccessFactory(resource=self, user=item)
                else:
                    UserResourceAccessFactory(resource=self, user=item[0], role=item[1])

        self.save()


class UserResourceAccessFactory(factory.django.DjangoModelFactory):
    """Create fake resource user accesses for testing."""

    class Meta:
        model = models.ResourceAccess

    resource = factory.SubFactory(ResourceFactory)
    user = factory.SubFactory(UserFactory)
    role = factory.fuzzy.FuzzyChoice(models.RoleChoices.values)


class RoomFactory(ResourceFactory):
    """Create fake rooms for testing."""

    class Meta:
        model = models.Room

    name = factory.Faker("catch_phrase")
    slug = factory.LazyAttribute(lambda o: slugify(o.name))
    access_level = factory.fuzzy.FuzzyChoice(models.RoomAccessLevel)


class RecordingFactory(factory.django.DjangoModelFactory):
    """Create fake recording for testing."""

    class Meta:
        model = models.Recording
        skip_postgeneration_save = True

    room = factory.SubFactory(RoomFactory)
    status = models.RecordingStatusChoices.INITIATED
    mode = models.RecordingModeChoices.SCREEN_RECORDING
    worker_id = None

    @factory.post_generation
    def users(self, create, extracted, **kwargs):
        """Add users to recording from a given list of users with or without roles."""
        if create and extracted:
            for item in extracted:
                if isinstance(item, models.User):
                    UserRecordingAccessFactory(recording=self, user=item)
                else:
                    UserRecordingAccessFactory(
                        recording=self, user=item[0], role=item[1]
                    )

            self.save()


class UserRecordingAccessFactory(factory.django.DjangoModelFactory):
    """Create fake recording user accesses for testing."""

    class Meta:
        model = models.RecordingAccess

    recording = factory.SubFactory(RecordingFactory)
    user = factory.SubFactory(UserFactory)
    role = factory.fuzzy.FuzzyChoice(models.RoleChoices.values)


class TeamRecordingAccessFactory(factory.django.DjangoModelFactory):
    """Create fake recording team accesses for testing."""

    class Meta:
        model = models.RecordingAccess

    recording = factory.SubFactory(RecordingFactory)
    team = factory.Sequence(lambda n: f"team{n}")
    role = factory.fuzzy.FuzzyChoice(models.RoleChoices.values)
