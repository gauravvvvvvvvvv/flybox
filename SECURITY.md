# Security Policy

## Supported version

FLYBOX is currently pre-1.0. Security fixes are applied to the latest code on `main`.

## Reporting a vulnerability

Please **do not open a public GitHub issue** for a suspected security vulnerability.

Use GitHub's private vulnerability reporting for this repository if it is enabled. If private reporting is unavailable, contact the repository owner privately through their GitHub profile and include:

- a concise description of the issue;
- affected component and version/commit;
- reproduction steps or proof of concept;
- potential impact;
- any suggested mitigation.

Please avoid accessing data or systems that do not belong to you, destructive testing, denial-of-service testing against the public deployment, or publishing a vulnerability before a fix can be prepared.

## Scope

Relevant reports include vulnerabilities in:

- the public FLYBOX web application;
- Web Worker/session isolation and cross-tab state separation;
- API input handling;
- experiment import/export;
- dependency or build-chain configuration;
- accidental exposure of secrets, unsafe static asset configuration, or reference-backend data.

The project intentionally stores sandbox state ephemerally and does not use user accounts or a persistent user database.

## Response

Valid reports will be investigated as quickly as practical. Fixes may be shipped before full public disclosure when necessary to protect users.
