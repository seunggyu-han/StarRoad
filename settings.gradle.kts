pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        exclusiveContent {
            forRepository { maven("https://nexus-playground.pleos.ai/repository/maven-releases/") }
            filter { includeGroup("ai.pleos.playground") }
        }
    }
}
rootProject.name = "StarRoad"
include(":app")
