# Frontend package boundary

TRL-667 owns the only Langflow source tree, Python environment, Node dependency tree, and editor process.

TRL-672 owns no copied Langflow file. It supplies a patch and probe fixtures to the TRL-667 owner during one serialized environment window.

The pinned frontend uses these source identities:

| Item | Identity |
| --- | --- |
| Frontend tree | `63f7b72114d42755ed55348c30728ccef4bf5532` |
| `package.json` | `40e188f9fbfb155769890cb7662a8e04371f3f1d` |
| `package-lock.json` | `b6db4ca27a64175777dbc8388514d710da8f7a44` |

The candidate build keeps its frontend assets and Node dependencies in the sealed Langflow package. It adds no Langflow dependency to the Trellis web package.

The Trellis route receives only the editor asset manifest and the isolated editor URL. The editor receives only the restricted document and component routes.

The authorized candidate uses Node 26.5.1. The upstream continuous integration environment uses Node 22.

The first dependency installation added 1,428 packages in 40.46 seconds. Its maximum resident memory was 554,287,104 bytes. The dependency directory uses 1,103,604 KiB. The package cache uses 184,368 KiB.

The clean baseline build took 28.36 seconds. Its maximum resident memory was 3,897,720,832 bytes. It produced 1,880 assets with 24,672,326 logical bytes and 30,668 KiB of disk use.

The cold start took 30,603 milliseconds and used 886,194,176 resident bytes. The warm start took 30,040 milliseconds and used 856,899,584 resident bytes. Both processes bound only to loopback.

The sandbox denied external TCP access and fixture credential reads. It allowed loopback access and writes inside its private directory. These measurements describe the TRL-667 environment. They do not prove the editor interactions in TRL-672.
