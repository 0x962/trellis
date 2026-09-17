#include <fcntl.h>
#include <stdio.h>

int main(int argc, char **argv) {
	if (renameatx_np(AT_FDCWD, argv[1], AT_FDCWD, argv[2], RENAME_SWAP) == -1) {
		perror("Cannot exchange application directories");
		return 1;
	}
	return 0;
}
