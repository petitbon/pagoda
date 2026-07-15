class Pagoda < Formula
  desc "Target-agnostic validation framework for agentic software"
  homepage "https://github.com/petitbon/pagoda"
  url "https://github.com/petitbon/pagoda/releases/download/v0.5.2/pagoda-cli-standalone.tgz"
  version "0.5.2"
  sha256 "c025cae4dddc9656df3142d7058a7cbd6f2ec616f3377bf17cd59e309e772980"
  license "Apache-2.0"

  depends_on "node"

  def install
    package_root = buildpath/"package"
    source_root = package_root.directory? ? package_root : buildpath

    libexec.install source_root.children

    (bin/"pagoda").write <<~SH
      #!/usr/bin/env bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/dist/index.js" "$@"
    SH
  end

  test do
    assert_match(/\A\d+\.\d+\.\d+/, shell_output("#{bin}/pagoda --version"))
  end
end
